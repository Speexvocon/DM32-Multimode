"""Bounded DP v1 PCM transport. Importing this module never opens a port.

230400 baud operation must be qualified with the user's programming cable.
Input/output is 8 kHz mono signed16LE; RF starts only through explicit start().
"""
from collections import deque
from dataclasses import dataclass,asdict
import json
from pathlib import Path
import struct
import time
import wave
import zlib

RATE=8000
SAMPLES=160
PAYLOAD=320
HEADER=struct.Struct('<2sBBHHIIII')
HELLO,START,DATA,STOP,END,ACK,STATUS,ERROR=range(1,9)
MODULATIONS={'FM':0,'NFM':1,'P25':2,'DMR':3}
MODES={'RAW':0,'VOICE':1}
DIRECTIONS={'RX':1,'TX':2}
ERRORS=('OK','bad frame','bad CRC','bad session','bad sequence','bad configuration',
        'queue full','policy refusal','underrun','timeout','time limit','hardware fault')
# Native close bounds:500ms output deadline plus150ms UART drain and margin.
CLOSE_SETTLE_SECONDS=.7
LINK_IDLE_SECONDS=2.0

class PcmError(RuntimeError):pass

def cobs_encode(data):
    out=bytearray(b'\x00');code_at=0;code=1
    for byte in data:
        if byte:
            out.append(byte);code+=1
            if code==255:
                out[code_at]=code;code_at=len(out);out.append(0);code=1
        else:
            out[code_at]=code;code_at=len(out);out.append(0);code=1
    out[code_at]=code
    return bytes(out)

def cobs_decode(data):
    out=bytearray();offset=0
    while offset<len(data):
        code=data[offset];offset+=1
        if not code or offset+code-1>len(data):raise PcmError('Malformed COBS packet.')
        block=data[offset:offset+code-1]
        if 0 in block:raise PcmError('Zero inside COBS packet.')
        out.extend(block);offset+=code-1
        if code!=255 and offset<len(data):out.append(0)
    if not data:raise PcmError('Empty COBS packet.')
    return bytes(out)

@dataclass(frozen=True)
class Frame:
    kind:int
    session:int
    sequence:int=0
    sample_index:int=0
    payload:bytes=b''
    flags:int=0

    def encode(self):
        if not 1<=self.kind<=8 or len(self.payload)>PAYLOAD:raise PcmError('Invalid frame type/length.')
        header=HEADER.pack(b'DP',1,self.kind,self.flags,len(self.payload),self.session,
                           self.sequence&0xffffffff,self.sample_index&0xffffffff,0)
        crc=zlib.crc32(header[:20]+self.payload)&0xffffffff
        return cobs_encode(header[:20]+struct.pack('<I',crc)+self.payload)+b'\0'

    @classmethod
    def decode(cls,wire):
        data=cobs_decode(wire)
        if not 24<=len(data)<=344:raise PcmError('Invalid decoded packet length.')
        magic,version,kind,flags,length,session,seq,index,crc=HEADER.unpack_from(data)
        if magic!=b'DP' or version!=1 or not 1<=kind<=8 or length!=len(data)-24:
            raise PcmError('Invalid DP header.')
        if zlib.crc32(data[:20]+data[24:])&0xffffffff!=crc:raise PcmError('PCM packet CRC mismatch.')
        if flags and not (kind==DATA and flags==1) and kind!=ERROR:raise PcmError('Unexpected frame flags.')
        if kind==DATA and length!=PAYLOAD:raise PcmError('PCM frame must contain 160 samples.')
        return cls(kind,session,seq,index,data[24:],flags)

class Decoder:
    """Bounded parser resynchronizes at delimiters; corrupt frames are counted."""
    def __init__(self):self.pending=bytearray();self.discard=False;self.bad_frames=0
    def feed(self,data):
        frames=[]
        for byte in data:
            if not byte:
                if self.pending and not self.discard:
                    try:frames.append(Frame.decode(bytes(self.pending)))
                    except PcmError:self.bad_frames+=1
                self.pending.clear();self.discard=False
            elif not self.discard:
                if len(self.pending)>=346:
                    self.pending.clear();self.discard=True;self.bad_frames+=1
                else:self.pending.append(byte)
        return frames

@dataclass(frozen=True)
class Status:
    ack_type:int
    state:int
    credit:int
    rx_frames:int
    tx_frames:int
    dropped:int
    underruns:int
    next_tx_sequence:int
    @classmethod
    def decode(cls,payload):
        if len(payload)!=24:raise PcmError('Invalid status payload.')
        value=cls(*struct.unpack('<BBHIIIII',payload))
        if value.credit>7 or value.state>5:raise PcmError('Invalid status fields.')
        return value

@dataclass
class CaptureReport:
    frames:int=0
    missing_frames:int=0
    duplicate_frames:int=0
    gap_flags:int=0
    bad_frames:int=0
    inserted_silence_samples:int=0
    padded_tx_samples:int=0
    radio_dropped:int=0
    radio_underruns:int=0
    stop_acknowledged:bool=False

def validate_config(mode,modulation,direction,hz):
    mode=str(mode).upper();modulation=str(modulation).upper();direction=str(direction).upper()
    if mode not in MODES or modulation not in MODULATIONS or direction not in DIRECTIONS:
        raise ValueError('Choose RAW/VOICE, FM/NFM/P25/DMR and RX/TX.')
    if mode=='RAW' and modulation not in ('FM','NFM'):
        raise ValueError('RAW supports FM/NFM discriminator samples only.')
    if isinstance(hz,bool) or not isinstance(hz,int) or not 1<=hz<=1000000000:
        raise ValueError('Frequency must be an integer Hz value; the radio validates its supported range.')
    return mode,modulation,direction,hz

def open_port(name,serial_module=None):
    if serial_module is None:import serial as serial_module
    port=serial_module.Serial(port=None,baudrate=115200,timeout=.02,write_timeout=.1)
    port.dtr=False;port.rts=False;port.port=name
    try:port.open()
    except BaseException:port.close();raise
    return port

class PcmClient:
    def __init__(self,port,on_output=None,clock=time.monotonic,sleep=time.sleep):
        self.port=port;self.output=on_output or (lambda value:None);self.clock=clock;self.sleep=sleep
        self.decoder=Decoder();self.frames=deque();self.session=None;self.binary=False
        self.config=None;self.status=None;self.hello=None;self.last_write=0;self.report=CaptureReport()

    def _write(self,data):
        # No retry of an uncertain/partial PCM frame: terminate the session.
        if self.port.write(data)!=len(data):raise PcmError('Incomplete serial write; RF session stopped.')
        self.last_write=self.clock()

    def send(self,kind,payload=b'',sequence=0):
        if not self.binary or self.session is None:raise PcmError('PCM session is not open.')
        self._write(Frame(kind,self.session,sequence,(sequence*SAMPLES)&0xffffffff,payload).encode())

    def _read(self):
        # Control ACKs are much shorter than PCM packets. Waiting for a
        # 512-byte read can hold START/credit replies until the 80-ms TX
        # prefill is exhausted. Block for one byte, then take only bytes
        # already available so the producer can act on each reply promptly.
        data=self.port.read(1)
        if data:
            waiting=min(511,max(0,getattr(self.port,'in_waiting',0)))
            if waiting:data+=self.port.read(waiting)
        for frame in self.decoder.feed(data):
            if frame.session!=self.session:
                self.decoder.bad_frames+=1;continue
            if frame.kind in (ACK,STATUS,ERROR):
                status=Status.decode(frame.payload)
                # Every status snapshot is ordered on this UART. Preserve the
                # accepted sequence to subtract host packets still in flight.
                self.status=status
                self.report.radio_dropped=status.dropped;self.report.radio_underruns=status.underruns
                if frame.kind==ERROR:
                    label=ERRORS[frame.flags] if frame.flags<len(ERRORS) else str(frame.flags)
                    raise PcmError('Radio PCM error: '+label)
            elif frame.kind==HELLO:
                if len(frame.payload)!=16:raise PcmError('Invalid HELLO payload.')
                self.hello=struct.unpack('<IHHHBBI',frame.payload)
                rate,samples,capacity,maximum,mod,modes,reserved=self.hello
                if (rate,samples,capacity,maximum,reserved)!=(8000,160,7,320,0):
                    raise PcmError('Unsupported radio PCM format.')
                if mod!=MODULATIONS[self.config[1]] or not modes&(1<<MODES[self.config[0]]):
                    raise PcmError('Radio PCM configuration differs from OPEN.')
            if len(self.frames)>=64:raise PcmError('Host processing fell behind the PCM stream.')
            self.frames.append(frame)

    def _next(self,deadline):
        while self.clock()<deadline:
            if self.frames:return self.frames.popleft()
            if self.binary and self.clock()-self.last_write>=.075:self.send(STATUS)
            self._read()
        raise TimeoutError('Timed out waiting for PCM response.')

    def _wait_ack(self,kind,timeout=3):
        deadline=self.clock()+timeout
        while True:
            frame=self._next(deadline)
            if frame.kind in (ACK,STATUS) and Status.decode(frame.payload).ack_type==kind:return frame

    def open(self,mode,modulation,direction,hz):
        self.config=validate_config(mode,modulation,direction,hz)
        if self.port.baudrate!=115200:raise PcmError('Start the connection at 115200 baud.')
        line='APP PCM OPEN %s %s %s %d\n'%self.config
        self._write(line.encode('ascii'))
        pending=bytearray();deadline=self.clock()+5
        while self.clock()<deadline:
            byte=self.port.read(1)
            if not byte:continue
            if byte==b'\n':
                text=pending.rstrip(b'\r').decode('ascii','replace');pending.clear();self.output(text)
                if text.startswith(('APP ERROR','APP ERR','APP PCM ERROR')):raise PcmError(text)
                parts=text.split()
                if parts[:3]==['APP','PCM','READY']:
                    if len(parts)!=5 or parts[3]!='230400' or not parts[4].isascii() or not parts[4].isdecimal():
                        raise PcmError('Invalid PCM READY response.')
                    session=int(parts[4])
                    if not 1<=session<=0xffffffff:raise PcmError('Invalid PCM session ID.')
                    self.session=session
                    self.sleep(.05);self.port.baudrate=230400;self.binary=True
                    self.send(HELLO);self._wait_ack(HELLO)
                    if self.hello is None:raise PcmError('Missing radio HELLO format.')
                    return
            elif len(pending)<512:pending.extend(byte)
            else:raise PcmError('Oversized ASCII PCM reply.')
        raise TimeoutError('No PCM READY reply; radio remains unkeyed.')

    def start(self):
        mode,mod,direction,_=self.config
        self.send(START,struct.pack('<BBBBI',MODES[mode],DIRECTIONS[direction],MODULATIONS[mod],0,0))
        self._wait_ack(START)

    def receive(self,write_pcm,duration):
        if not self.config or self.config[2]!='RX':raise PcmError('RX session required.')
        if not 0<duration<=3600:raise ValueError('Capture duration must be above 0 and at most 3600 seconds.')
        self.start();expected=0;deadline=self.clock()+duration
        while self.clock()<deadline:
            try:frame=self._next(min(deadline,self.clock()+.1))
            except TimeoutError:continue
            if frame.kind!=DATA:continue
            if frame.sample_index!=(frame.sequence*SAMPLES)&0xffffffff:raise PcmError('RX sample index mismatch.')
            missing=(frame.sequence-expected)&0xffffffff
            if missing>=0x80000000:self.report.duplicate_frames+=1;continue
            if missing>5000:raise PcmError('RX gap exceeds 100 seconds; recording stopped.')
            if missing:
                self.report.missing_frames+=missing;self.report.inserted_silence_samples+=missing*SAMPLES
                for _ in range(missing):write_pcm(bytes(PAYLOAD))
            if frame.flags&1:self.report.gap_flags+=1
            write_pcm(frame.payload);self.report.frames+=1;expected=(frame.sequence+1)&0xffffffff
        self.report.bad_frames=self.decoder.bad_frames
        return self.report

    def transmit(self,pcm):
        if not self.config or self.config[2]!='TX':raise PcmError('Explicit TX session required.')
        if not pcm or len(pcm)%2:raise ValueError('TX input must contain complete signed 16-bit samples.')
        padded=max(4*PAYLOAD,((len(pcm)+PAYLOAD-1)//PAYLOAD)*PAYLOAD)
        self.report.padded_tx_samples=(padded-len(pcm))//2
        pcm=pcm+bytes(padded-len(pcm));total=len(pcm)//PAYLOAD;sent=0
        def available():
            if self.status is None:return 0
            outstanding=(sent-self.status.next_tx_sequence)&0xffffffff
            return max(0,self.status.credit-outstanding) if outstanding<=7 else 0
        # Four frames provide80ms of actual queued audio before RF is allowed.
        while sent<4:
            if available():
                self.send(DATA,pcm[sent*PAYLOAD:(sent+1)*PAYLOAD],sent);sent+=1
            else:self._next(self.clock()+2)
        self.start();stall=self.clock()+2
        while sent<total:
            if available():
                self.send(DATA,pcm[sent*PAYLOAD:(sent+1)*PAYLOAD],sent);sent+=1;stall=self.clock()+2
            else:self._next(stall)
        self.send(END,sequence=sent);self._wait_ack(END,3)
        if self.status.state!=4:raise PcmError('END did not confirm drained/unkeyed state.')
        self.report.frames=total;return self.report

    def stop(self):
        was_binary=self.binary;stop_failed=False
        try:
            if self.binary:
                self.send(STOP);self._wait_ack(STOP,1)
                self.report.stop_acknowledged=True
        except BaseException:
            stop_failed=True;raise
        finally:
            # Radio has an independent TX watchdog even if the cable fails.
            try:
                if was_binary:
                    faulted=self.status is not None and self.status.state==5
                    # Without a STOP ACK/fault, stop sending heartbeats and
                    # allow the native idle watchdog to close the session too.
                    self.sleep(CLOSE_SETTLE_SECONDS+(0 if self.report.stop_acknowledged or faulted else LINK_IDLE_SECONDS))
                self.port.baudrate=115200;self.binary=False
                if was_binary:
                    # A fault may auto-close before our binary STOP arrives.
                    # Terminate its possible ASCII garbage prefix only after
                    # the native close/drain deadline; preserve any STOP error.
                    self._write(b'\n')
            except BaseException:
                if not stop_failed:raise
            finally:
                self.report.bad_frames=self.decoder.bad_frames

def read_audio(path,raw=False):
    path=Path(path)
    if path.stat().st_size>64*1024*1024:raise ValueError('Audio file exceeds 64 MiB.')
    if raw:data=path.read_bytes()
    else:
        with wave.open(str(path),'rb') as wav:
            if (wav.getnchannels(),wav.getsampwidth(),wav.getframerate(),wav.getcomptype())!=(1,2,8000,'NONE'):
                raise ValueError('WAV must be uncompressed 8 kHz mono signed 16-bit PCM.')
            data=wav.readframes(wav.getnframes())
    if not data or len(data)%2:raise ValueError('Audio must contain complete signed 16-bit samples.')
    return data

def write_report(path,report):
    Path(str(path)+'.json').write_text(json.dumps(asdict(report),indent=2)+'\n',encoding='utf-8')
