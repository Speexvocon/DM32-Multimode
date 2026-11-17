# SPDX-License-Identifier: GPL-3.0-or-later
"""Offline DAPP v1 compiler/validator and bounded APP installation protocol.

Only the portable sandbox bytecode is emitted. No native code, Python eval,
filesystem access from applets, arbitrary register access or transmit opcode.
"""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import shlex
import struct
import time
import zlib

MAX_PACKAGE=32768
HEADER=struct.Struct('<4sHHIIIHHII24sII')
INSTRUCTION=struct.Struct('<BBHI')
CAPS={'same':1,'serial':2,'display':4,'key':8}
OPS={'end':0,'set':1,'add':2,'jeq':3,'jne':4,'jmp':5,'wait':6,'yield':7,
    'print':8,'title':9,'same':10,'last':11,'show_same':12,'print_reg':13,'get':14,'await':15}
OP_NAMES={value:key for key,value in OPS.items()}
FIELDS={'event':0,'originator':1,'locations':2,'purge':3,'day':4,'hour':5,'minute':6,'confirmed':7,'key':8,
    'uptime_ms':9,'headers':10,'confirmations':11,'eoms':12,'event_sequence':13}
EVENTS={'header':1,'confirmed':2,'eom':4,'key':8,'same':7,'any':15}
NOAA_HZ=tuple(range(162400000,162550001,25000))


class AppletError(ValueError):
    """Invalid source or package; no hardware action has occurred."""


class ProtocolError(RuntimeError):
    """Radio rejected an APP operation."""


@dataclass(frozen=True)
class Package:
    data: bytes
    name: str
    capabilities: int
    code_count: int
    entry: int
    strings_size: int
    crc32: int

    def describe(self):
        return {'format':'DAPP','version':1,'name':self.name,'bytes':len(self.data),
            'capabilities':[name for name,bit in CAPS.items() if self.capabilities&bit],
            'instructions':self.code_count,'entry':self.entry,'strings_bytes':self.strings_size,
            'package_crc32':self.crc32,'upload_crc32':zlib.crc32(self.data)&0xffffffff,
            'sha256':hashlib.sha256(self.data).hexdigest()}


def _ascii(text,minimum,maximum,label):
    try:encoded=text.encode('ascii')
    except UnicodeEncodeError as error:raise AppletError(f'{label} must be printable ASCII.') from error
    if not minimum<=len(encoded)<=maximum or any(byte<32 or byte>126 for byte in encoded):
        raise AppletError(f'{label} must contain {minimum}..{maximum} printable ASCII bytes.')
    return encoded


def _unsigned(text):
    if not re.fullmatch(r'(?:0[xX][0-9a-fA-F]+|[0-9]+)',text):
        raise AppletError('Expected an unsigned decimal or hexadecimal integer.')
    value=int(text,16 if text.lower().startswith('0x') else 10)
    if not 0<=value<=0xffffffff:raise AppletError('Integer must fit unsigned 32 bits.')
    return value


def _register(text):
    if not re.fullmatch(r'[rR][0-7]',text):raise AppletError('Register must be r0..r7.')
    return int(text[1])


def _duration(text):
    value=_unsigned(text)
    if not 1<=value<=60000:raise AppletError('Wait duration must be 1..60000 milliseconds.')
    return value


def _required_capabilities(op,a,b,immediate):
    if op in (OPS['print'],OPS['print_reg']):return CAPS['serial']
    if op==OPS['title']:return CAPS['display']
    if op==OPS['same']:return CAPS['same']
    if op==OPS['last']:return CAPS['same']|CAPS['serial']
    if op==OPS['show_same']:return CAPS['same']|CAPS['display']
    if op==OPS['get']:return CAPS['key'] if b==FIELDS['key'] else 0 if b==FIELDS['uptime_ms'] else CAPS['same']
    if op==OPS['await']:return (CAPS['same'] if b&7 else 0)|(CAPS['key'] if b&8 else 0)
    return 0


def validate_package(data):
    data=bytes(data)
    if not 64<=len(data)<=MAX_PACKAGE:raise AppletError('Package size must be 64..32768 bytes.')
    magic,version,header_size,total,caps,code_offset,count,entry,strings_offset,strings_size,name,reserved,crc=HEADER.unpack_from(data)
    if magic!=b'DAPP' or version!=1 or header_size!=64:raise AppletError('Unsupported DAPP header/version.')
    if total!=len(data) or reserved or caps&~15:raise AppletError('Invalid length, reserved field or capability bits.')
    if code_offset!=64 or not 1<=count<=4088 or entry>=count:
        raise AppletError('Invalid instruction section or entry point.')
    if strings_offset!=64+count*8 or total!=strings_offset+strings_size:
        raise AppletError('Package sections must be contiguous without trailing bytes.')
    zero=name.find(b'\0')
    if zero<1 or any(name[zero:]) or any(byte<32 or byte>126 for byte in name[:zero]):
        raise AppletError('Applet name must be nonempty ASCII with canonical zero padding.')
    if zlib.crc32(data[:60]+data[64:])&0xffffffff!=crc:raise AppletError('Package CRC32 mismatch.')
    strings=data[strings_offset:]
    if any(byte<32 or byte>126 for byte in strings):raise AppletError('String pool must contain printable ASCII only.')
    for index in range(count):
        op,a,b,immediate=INSTRUCTION.unpack_from(data,64+index*8)
        error=None
        if op not in OP_NAMES:error='unknown opcode'
        elif op in (0,7,11,12):
            if a or b or immediate:error='nonzero unused operand'
        elif op in (1,2):
            if a>=8 or b:error='invalid register or unused operand'
        elif op in (3,4):
            if a>=8 or b>=count:error='invalid register or branch target'
        elif op==5:
            if a or b>=count or immediate:error='invalid jump target or unused operand'
        elif op==6:
            if a or b or not 1<=immediate<=60000:error='invalid wait duration or unused operand'
        elif op in (8,9):
            if a or not 1<=b<=95 or immediate>len(strings) or b>len(strings)-immediate:error='invalid literal range'
        elif op==10:
            if a or b or immediate not in NOAA_HZ:error='invalid NOAA frequency or unused operand'
        elif op==13:
            if a>=8 or b or immediate:error='invalid register or unused operand'
        elif op==14:
            if a>=8 or b>13 or immediate:error='invalid register, field or unused operand'
        elif op==15:
            if a>=8 or not 1<=b<=15 or not 1<=immediate<=60000:error='invalid wait register, mask or duration'
        if error:raise AppletError(f'Instruction {index}: {error}.')
        needed=_required_capabilities(op,a,b,immediate)
        if needed&caps!=needed:raise AppletError(f'Instruction {index}: required capability not declared.')
    return Package(data,name[:zero].decode('ascii'),caps,count,entry,strings_size,crc)


def compile_source(source):
    """Compile the line-oriented applet DSL. Labels resolve to instruction indices."""
    if not isinstance(source,str) or len(source)>262144:raise AppletError('Source must be text of at most 256 KiB.')
    name=None;caps=None;instructions=[];labels={};branches=[];strings=bytearray();literals={}
    def literal(text):
        encoded=_ascii(text,1,95,'Literal')
        if encoded not in literals:literals[encoded]=len(strings);strings.extend(encoded)
        return len(encoded),literals[encoded]
    for number,line in enumerate(source.splitlines(),1):
        try:
            words=shlex.split(line,comments=True,posix=True)
            if not words:continue
            keyword=words[0].lower()
            if len(words)==1 and keyword.endswith(':'):
                label=keyword[:-1]
                if not re.fullmatch(r'[a-z_][a-z0-9_]*',label) or label in labels:
                    raise AppletError('Label must be a unique identifier.')
                labels[label]=len(instructions);continue
            if keyword=='name' and len(words)==2:
                if name is not None or instructions:raise AppletError('Declare name once before instructions.')
                name=_ascii(words[1],1,23,'Name');continue
            if keyword=='caps':
                if caps is not None or instructions:raise AppletError('Declare caps once before instructions.')
                declarations=[item.lower() for item in words[1:]]
                if not declarations:raise AppletError('Declare caps same/serial/display/key, or caps none.')
                if declarations==['none']:caps=0;continue
                if len(set(declarations))!=len(declarations) or any(item not in CAPS for item in declarations):
                    raise AppletError('Capabilities are same, serial, display and key; transmit is unavailable.')
                caps=sum(CAPS[item] for item in declarations);continue
            if name is None or caps is None:raise AppletError('Declare name and caps before instructions.')
            op=a=b=immediate=0
            if keyword in ('end','yield','last') and len(words)==1:op=OPS[keyword]
            elif keyword=='show' and [word.lower() for word in words]==['show','same']:op=OPS['show_same']
            elif keyword in ('set','add') and len(words)==3:
                op=OPS[keyword];a=_register(words[1]);immediate=_unsigned(words[2])
            elif keyword=='if' and len(words)==6 and words[2] in ('==','!=') and words[4].lower()=='goto':
                op=OPS['jeq' if words[2]=='==' else 'jne'];a=_register(words[1]);immediate=_unsigned(words[3]);branches.append((len(instructions),words[5].lower()))
            elif keyword=='goto' and len(words)==2:
                op=OPS['jmp'];branches.append((len(instructions),words[1].lower()))
            elif keyword=='wait' and len(words)==2:op=OPS['wait'];immediate=_duration(words[1])
            elif keyword=='same' and len(words)==2:
                op=OPS['same'];immediate=_unsigned(words[1])
                if immediate not in NOAA_HZ:raise AppletError('SAME frequency must be a NOAA channel in integer Hz.')
            elif keyword in ('title','print') and len(words)==2:
                if keyword=='print' and re.fullmatch(r'[rR][0-7]',words[1]):op=OPS['print_reg'];a=_register(words[1])
                else:op=OPS[keyword];b,immediate=literal(words[1])
            elif keyword=='get' and len(words)==3:
                op=OPS['get'];a=_register(words[1]);field=words[2].lower()
                if field not in FIELDS:raise AppletError('Unknown field; use '+', '.join(FIELDS)+'.')
                b=FIELDS[field]
            elif keyword=='await' and 2<=len(words)<=4:
                op=OPS['await'];tail=words[1:];event=tail[0].lower()
                if event in EVENTS:b=EVENTS[event];tail=tail[1:]
                else:b=EVENTS['same']
                if len(tail) not in (1,2):raise AppletError('Use await [header/confirmed/eom/key/same/any] ms [rN].')
                immediate=_duration(tail[0]);a=_register(tail[1]) if len(tail)==2 else 0
            else:raise AppletError('Unknown statement or wrong operands.')
            needed=_required_capabilities(op,a,b,immediate)
            if needed&caps!=needed:raise AppletError('Statement requires an undeclared capability.')
            instructions.append((op,a,b,immediate))
            if len(instructions)>4088:raise AppletError('Too many instructions.')
        except (AppletError,ValueError) as error:
            raise AppletError(f'Line {number}: {error}') from error
    if name is None or caps is None or not instructions:raise AppletError('Source requires name, caps and at least one instruction.')
    for index,label in branches:
        if label not in labels or labels[label]>=len(instructions):raise AppletError(f'Unknown or terminal-only label: {label}.')
        op,a,_,immediate=instructions[index];instructions[index]=(op,a,labels[label],immediate)
    code=b''.join(INSTRUCTION.pack(*instruction) for instruction in instructions)
    total=64+len(code)+len(strings)
    if total>MAX_PACKAGE:raise AppletError('Compiled package exceeds 32768 bytes.')
    header=HEADER.pack(b'DAPP',1,64,total,caps,64,len(instructions),0,64+len(code),len(strings),name.ljust(24,b'\0'),0,0)
    data=bytearray(header+code+strings);struct.pack_into('<I',data,60,zlib.crc32(data[:60]+data[64:])&0xffffffff)
    return validate_package(data)


def load_package(path):
    path=Path(path)
    if path.stat().st_size>262144:raise AppletError('Input exceeds 256 KiB.')
    data=path.read_bytes()
    if data.startswith(b'DAPP'):return validate_package(data)
    try:return compile_source(data.decode('utf-8'))
    except UnicodeDecodeError as error:raise AppletError('Source must be UTF-8 text or a valid DAPP package.') from error


def open_port(name,serial_module=None):
    if serial_module is None:
        import serial as serial_module
    port=serial_module.Serial(port=None,baudrate=115200,timeout=.1,write_timeout=2)
    port.dtr=False;port.rts=False;port.port=name
    try:port.open()
    except Exception:
        port.close();raise
    return port


class AppletClient:
    """One-shot protocol client; serial writes only happen on explicit methods."""
    def __init__(self,port,on_output=None,clock=time.monotonic):
        self.port=port;self.on_output=on_output or (lambda line:None);self.clock=clock
        self.pending=bytearray();self.discarding=False

    def _line(self):
        data=self.port.readline(513)
        for byte in data:
            if byte==10:
                if self.discarding:line='[Oversized serial line discarded]'
                else:line=''.join(chr(item) if 32<=item<=126 else '?' for item in self.pending.rstrip(b'\r'))
                self.pending.clear();self.discarding=False
                return line
            if not self.discarding:
                if len(self.pending)>=512:self.pending.clear();self.discarding=True
                else:self.pending.append(byte)
        return None

    def _exchange(self,command,expected,timeout=3,retries=0):
        if not command.startswith('APP ') or len(command)>119 or any(ord(char)<32 or ord(char)>126 for char in command):
            raise ValueError('Invalid APP protocol command.')
        wire=(command+'\n').encode('ascii')
        for attempt in range(retries+1):
            if self.port.write(wire)!=len(wire):raise ProtocolError('Incomplete serial write.')
            deadline=self.clock()+timeout
            while self.clock()<deadline:
                line=self._line()
                if line is None:continue
                self.on_output(line)
                if line.startswith('APP ERROR') or line.startswith('APP ERR '):raise ProtocolError(line)
                if line==expected or (expected.endswith(' ') and line.startswith(expected)):return line
                if expected=='APP STOPPED' and (line.startswith('APP STOPPED;') or line.startswith('APP STOPPED ')):return line
            if attempt==retries:raise TimeoutError(f'No reply to {command.split()[1]} before timeout.')
        raise AssertionError('Unreachable retry state')

    def store_status(self):return self._exchange('APP STORE STATUS','APP OK STORE STATUS',timeout=60)

    def install(self,slot,package):
        slot=_slot(slot)
        package=validate_package(package.data if isinstance(package,Package) else package)
        crc=zlib.crc32(package.data)&0xffffffff
        begun=False
        try:
            begun=True
            self._exchange(f'APP INSTALL BEGIN {slot} {len(package.data)} {crc}','APP OK INSTALL BEGIN',timeout=60)
            for offset in range(0,len(package.data),32):
                chunk=package.data[offset:offset+32]
                self._exchange(f'APP INSTALL DATA {offset} {chunk.hex()}',f'APP OK INSTALL DATA {offset+len(chunk)}',retries=2)
            return self._exchange('APP INSTALL COMMIT','APP OK INSTALL COMMIT',timeout=60)
        except BaseException:
            if begun:
                try:self._exchange('APP INSTALL ABORT','APP OK INSTALL ABORT')
                except Exception:pass
            raise

    def run(self,slot):
        slot=_slot(slot);return self._exchange(f'APP RUN {slot}',f'APP OK RUN {slot}',timeout=60)

    def remove(self,slot):
        slot=_slot(slot)
        # A newly booted radio has only scheduled the read-only foreign-data
        # scan. Complete that scan explicitly before requesting a tombstone.
        self.store_status()
        return self._exchange(f'APP REMOVE {slot}',f'APP OK REMOVE {slot}',timeout=60)

    def stop(self):return self._exchange('APP STOP','APP STOPPED')


def _slot(value):
    if isinstance(value,bool):raise ValueError('Slot must be 1..8.')
    if isinstance(value,str):
        if not re.fullmatch(r'[1-8]',value):raise ValueError('Slot must be 1..8.')
        value=int(value)
    if not isinstance(value,int) or not 1<=value<=8:raise ValueError('Slot must be 1..8.')
    return value


def package_json(package):return json.dumps(package.describe(),indent=2)
