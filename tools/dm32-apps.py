#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Interactive terminal for built-in and installable DM32 serial applets.

Requires pyserial (requirements-bench.txt). Connect the powered-on radio's
programming cable and close CPS/other serial tools first. Opening the terminal
does not change the channel or start a receiver; enter `same 162.550` to start.
Only APP/APPS commands are sent. Local `install 1 path.dappsrc` validates and
installs a sandbox package without starting it. No firmware or transmit commands.
"""
import argparse
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import importlib
import importlib.util
from pathlib import Path
import queue
import re
import sys
import threading

COMMAND_MAX=95
LOCAL_COMMAND_MAX=1024
LINE_MAX=512
REPLY_QUEUE_MAX=128
NOAA_HZ=tuple(range(162400000,162550001,25000))
LOCAL_HELP='''apps                     List available apps
slots                    List installed packages / storage status
install <1..8> <path>     Validate .dappsrc/.dapp and install without running
run <1..8>               Run an installed applet
remove <1..8>            Remove an installed applet
appstatus                Current applet execution status
same [162.550 or Hz]      Start SAME reception (default 162.550 MHz)
status / last            Receiver counters / last SAME header
watch on / watch off     Enable / disable live header lines
stop                     Restore normal radio operation
help / quit              Show help / stop app and exit
APP ...                  The equivalent APP protocol commands also work'''


@dataclass(frozen=True)
class Command:
    wire: str | None=None
    quit: bool=False
    local_help: bool=False
    install_slot: int | None=None
    install_path: str | None=None


def same_frequency(text):
    """Accept exact NOAA MHz or integer Hz, never silently round a channel."""
    if len(text)>20 or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?',text):
        raise ValueError('Use a NOAA channel in MHz (162.550) or Hz (162550000).')
    try:
        value=Decimal(text)
        hz=value*1000000 if value<1000 else value
        if hz!=hz.to_integral_value() or int(hz) not in NOAA_HZ:
            raise ValueError('Choose 162.400, .425, .450, .475, .500, .525 or .550 MHz.')
        return int(hz)
    except InvalidOperation as error:
        raise ValueError('Invalid frequency.') from error


def parse_command(text):
    """Map friendly aliases to the isolated APP namespace; never pass through."""
    if len(text)>LOCAL_COMMAND_MAX or any(ord(char)<32 or ord(char)==127 for char in text):
        raise ValueError('Local input must be at most 1024 characters without controls.')
    # Treat the rest of a local install line as a path, not as shell syntax.
    # In particular, shlex's POSIX escaping would destroy Windows backslashes.
    local_install=re.fullmatch(r'\s*install\s+([1-8])\s+(.+?)\s*',text,re.IGNORECASE)
    if local_install:
        path=local_install[2]
        if path[0] in ('"',"'"):
            if len(path)<2 or path[-1]!=path[0]:raise ValueError('Close the quoted install path.')
            path=path[1:-1]
        if not path or Path(path).suffix.lower() not in ('.dappsrc','.dapp'):
            raise ValueError('Install a .dappsrc source file or .dapp package.')
        return Command(install_slot=int(local_install[1]),install_path=path)
    if len(text)>COMMAND_MAX or any(ord(char)>126 for char in text):
        raise ValueError('Command must be at most 95 printable ASCII characters.')
    words=text.strip().split()
    if not words:return Command()
    lower=[word.lower() for word in words]
    if lower in (['quit'],['exit']):return Command(quit=True)
    if lower in (['help'],['?']):return Command(local_help=True)
    if lower==['apps']:return Command('APPS')
    if lower==['slots'] or lower==['app','store','status']:return Command('APP STORE STATUS')
    if lower==['appstatus'] or lower==['app','status']:return Command('APP STATUS')
    shorthand=re.fullmatch(r'(run|remove)([1-8])',lower[0]) if len(lower)==1 else None
    if shorthand:return Command(f'APP {shorthand[1].upper()} {shorthand[2]}')
    for action in ('run','remove'):
        if (len(lower)==2 and lower[0]==action) or (len(lower)==3 and lower[:2]==['app',action]):
            if not re.fullmatch('[1-8]',words[-1]):raise ValueError('Slot must be 1..8.')
            return Command(f'APP {action.upper()} {words[-1]}')
    if lower==['app'] or lower==['app','help']:return Command('APP HELP')
    if lower==['stop'] or lower==['app','stop']:return Command('APP STOP')
    if lower in (['status'],['last']):return Command('APP SAME '+lower[0].upper())
    if len(lower)==2 and lower[0]=='watch' and lower[1] in ('on','off'):
        return Command('APP SAME WATCH '+lower[1].upper())
    if lower[0]=='same':
        tail=words[1:]
        if tail and tail[0].lower()=='start':tail=tail[1:]
        if len(tail)>1:raise ValueError('Use same [MHz or Hz].')
        hz=same_frequency(tail[0]) if tail else 162550000
        return Command(f'APP SAME START {hz}')
    if len(lower)==1 and lower[0].startswith('same') and len(lower[0])>4:
        return Command(f'APP SAME START {same_frequency(words[0][4:])}')
    if lower[:2]==['app','same']:
        if len(words)==2:return Command('APP SAME STATUS')
        if len(words)==3 and lower[2] in ('status','last'):
            return Command('APP SAME '+lower[2].upper())
        if lower[2]=='start' and len(words) in (3,4):
            hz=same_frequency(words[3]) if len(words)==4 else 162550000
            return Command(f'APP SAME START {hz}')
        if len(words)==4 and lower[2]=='watch' and lower[3] in ('on','off'):
            return Command('APP SAME WATCH '+lower[3].upper())
    raise ValueError('Unknown command. Enter help to list commands.')


class LineDecoder:
    """Bound memory and strip terminal control sequences from serial output."""
    def __init__(self):
        self.pending=bytearray()
        self.discarding=False

    def feed(self,data):
        lines=[]
        for value in data:
            if value==10:
                if self.discarding:lines.append('[Oversized serial line discarded]')
                elif self.pending:
                    raw=bytes(self.pending).rstrip(b'\r')
                    lines.append(''.join(chr(byte) if 32<=byte<=126 else '?' for byte in raw))
                self.pending.clear();self.discarding=False
            elif not self.discarding:
                if len(self.pending)>=LINE_MAX:
                    self.pending.clear();self.discarding=True
                else:self.pending.append(value)
        return lines


def open_port(name,serial_module=None):
    # Delay import for --help, offline parsing and tests without pyserial.
    if serial_module is None:
        import serial as serial_module
    port=serial_module.Serial(port=None,baudrate=115200,timeout=0.1,write_timeout=1)
    port.dtr=False;port.rts=False
    port.port=name
    try:port.open()
    except Exception:
        port.close()
        raise
    return port


def send_command(port,command):
    # Only parser-created APP commands reach this function. Still enforce the
    # boundary here so future callers cannot inject firmware/serial commands.
    if parse_command(command).wire!=command:
        raise ValueError('Only canonical APP/APPS commands may be sent.')
    wire=(command+'\n').encode('ascii')
    if port.write(wire)!=len(wire):raise OSError('Incomplete serial write.')


def _applet_module():
    """Load compiler/client only for an explicit install, including file imports."""
    try:return importlib.import_module('dm32_applet')
    except ModuleNotFoundError as error:
        if error.name!='dm32_applet':raise
    spec=importlib.util.spec_from_file_location('dm32_applet',Path(__file__).with_name('dm32_applet.py'))
    if spec is None or spec.loader is None:raise ImportError('Cannot locate dm32_applet.py beside this terminal.')
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    try:spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(spec.name,None)
        raise
    return module


def configure_completion(readline_module=None):
    """Use ordinary terminal completion when readline exists; optional on Windows."""
    if readline_module is None:
        try:readline_module=importlib.import_module('readline')
        except ImportError:return False
    choices=('apps','slots','install','run','remove','appstatus','same','status','last','watch','stop','help','quit')
    def complete(text,index):
        matches=[choice for choice in choices if choice.startswith(text.lower())]
        return matches[index]+' ' if index<len(matches) else None
    readline_module.set_completer(complete)
    readline_module.parse_and_bind('tab: complete')
    return True


class _ReplyPort:
    """AppletClient adapter: the background thread is the only serial reader."""
    def __init__(self,port,replies,stopped,overflow,reader_errors):
        self.port=port;self.replies=replies;self.stopped=stopped
        self.overflow=overflow;self.reader_errors=reader_errors;self.pending=b''

    def write(self,data):
        # The client's transfer protocol has no generic command pass-through.
        if not isinstance(data,bytes) or not data.endswith(b'\n'):
            raise ValueError('Invalid APP upload command.')
        try:line=data[:-1].decode('ascii')
        except UnicodeDecodeError as error:raise ValueError('Invalid APP upload command.') from error
        if len(line)>COMMAND_MAX or not re.fullmatch(
                r'APP INSTALL (?:BEGIN [1-8] [0-9]{1,5} [0-9]{1,10}|DATA [0-9]{1,5} [0-9a-f]{2,64}|COMMIT|ABORT)',line):
            raise ValueError('Invalid APP upload command.')
        words=line.split()
        if words[2]=='BEGIN':
            length,crc=int(words[4]),int(words[5])
            if not 64<=length<=32768 or crc>0xFFFFFFFF or words[4]!=str(length) or words[5]!=str(crc):
                raise ValueError('Invalid APP upload size or CRC.')
        elif words[2]=='DATA':
            offset=int(words[3]);characters=len(words[4])
            if characters%2 or offset+characters//2>32768 or words[3]!=str(offset):
                raise ValueError('Invalid APP upload offset or hex length.')
        return self.port.write(data)

    def readline(self,size=513):
        if self.overflow.is_set():raise OSError('APP reply queue overflow; upload interrupted.')
        if not self.pending:
            try:self.pending=self.replies.get(timeout=0.1)
            except queue.Empty:
                if self.stopped.is_set():
                    detail=str(self.reader_errors[-1]) if self.reader_errors else 'connection closed'
                    raise OSError(f'Serial reader stopped: {detail}')
                return b''
        if size<=0:return b''
        data=self.pending[:size];self.pending=self.pending[size:]
        return data


def terminal_session(port,read_input=input,out=None,err=None):
    out=out or sys.stdout;err=err or sys.stderr
    stopped=threading.Event();write_lock=threading.Lock();reader_errors=[]
    exchange_active=threading.Event();reply_overflow=threading.Event()
    replies=queue.Queue(maxsize=REPLY_QUEUE_MAX)
    def display(message,stream=out):
        with write_lock:print(message,file=stream,flush=True)
    def read_serial():
        decoder=LineDecoder()
        try:
            while not stopped.is_set():
                for line in decoder.feed(port.read(256)):
                    display(line)
                    if exchange_active.is_set() and line.startswith('APP '):
                        try:replies.put_nowait((line+'\n').encode('ascii'))
                        except queue.Full:reply_overflow.set()
        except Exception as error:
            reader_errors.append(error)
            display(f'Serial connection lost: {error}',err)
            stopped.set()
    reader=threading.Thread(target=read_serial,name='dm32-app-reader',daemon=True)
    reader.start()
    display('DM32 microapps connected at 115200 baud. Enter help for commands.')
    display('No app started. Enter slots, install 1 path.dappsrc, or same 162.550.')
    result=0
    try:
        while not stopped.is_set():
            try:entered=read_input('dm32> ')
            except EOFError:break
            try:command=parse_command(entered)
            except ValueError as error:
                display(str(error),err);continue
            if command.quit:break
            if command.local_help:display(LOCAL_HELP)
            elif command.install_path is not None:
                try:
                    applets=_applet_module()
                    # Compile/validate before even starting an exchange: a bad
                    # local file must not send BEGIN, STOP or any other request.
                    package=applets.load_package(command.install_path)
                    while True:
                        try:replies.get_nowait()
                        except queue.Empty:break
                    reply_overflow.clear();exchange_active.set()
                    adapter=_ReplyPort(port,replies,stopped,reply_overflow,reader_errors)
                    client=applets.AppletClient(adapter,on_output=lambda line:None)
                    client.install(command.install_slot,package)
                    display(f'Installed "{package.name}" in slot {command.install_slot} ({len(package.data)} bytes). Enter run {command.install_slot} to start it.')
                except Exception as error:display(f'Install failed: {error}',err)
                finally:exchange_active.clear()
            elif command.wire:send_command(port,command.wire)
    except KeyboardInterrupt:
        display('\nStopping app and returning to normal radio operation.')
    except Exception as error:
        display(f'Serial error: {error}',err);result=1
    finally:
        # An orderly exit restores through the same firmware ownership path.
        # A disconnected USB cable cannot deliver STOP; the radio's Back key
        # is the independent local stop path provided by the firmware.
        try:send_command(port,'APP STOP')
        except Exception as error:
            display(f'Could not deliver APP STOP: {error}. Stop locally on the radio.',err);result=1
        exchange_active.clear();stopped.set();reader.join(timeout=0.5)
        port.close()
    return 1 if reader_errors else result


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',default='COM8',help='Programming cable serial port (default COM8)')
    args=parser.parse_args(argv)
    try:port=open_port(args.port)
    except ImportError:
        print('Install pyserial: python -m pip install -r requirements-bench.txt',file=sys.stderr);return 1
    except Exception as error:
        print(f'Cannot open {args.port}: {error}. Close CPS or other serial tools.',file=sys.stderr);return 1
    configure_completion()
    return terminal_session(port)


if __name__=='__main__':raise SystemExit(main())
