#!/usr/bin/env python3
"""Explicit receive/transmit PCM sessions; no RF activity for --help/import."""
import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys
import wave
from dm32_pcm import PcmClient,open_port,read_audio,validate_config,write_report

def main(argv=None):
    parser=argparse.ArgumentParser(description='DM32 serial PCM: 8 kHz mono signed 16-bit little endian. Requires PCM firmware and a cable that supports 230400 baud.')
    parser.add_argument('--port',default='COM8')
    sub=parser.add_subparsers(dest='action',required=True)
    for action in ('rx','tx'):
        command=sub.add_parser(action,help='Receive PCM' if action=='rx' else 'Explicitly transmit audio over RF')
        command.add_argument('file',type=Path)
        command.add_argument('--mode',choices=('RAW','VOICE'),default='VOICE')
        command.add_argument('--modulation',choices=('FM','NFM','P25','DMR'),required=True)
        command.add_argument('--hz',type=int,required=True,help='Frequency in integer Hz, for example 145700000')
        command.add_argument('--raw',action='store_true',help='Headerless signed16LE file instead of WAV')
        if action=='rx':command.add_argument('--seconds',type=float,default=10,help='Capture duration, up to 3600 seconds (default: 10)')
    args=parser.parse_args(argv)
    try:
        validate_config(args.mode,args.modulation,args.action.upper(),args.hz)
        if args.action=='rx' and not 0<args.seconds<=3600:raise ValueError('--seconds must be above 0 and at most 3600.')
        pcm=read_audio(args.file,args.raw) if args.action=='tx' else None
        if args.action=='rx' and args.file.exists():raise ValueError('Output exists; choose a new filename.')
    except (ValueError,OSError,wave.Error) as error:parser.error(str(error))
    port=None;client=None;result=0
    try:
        port=open_port(args.port);client=PcmClient(port,on_output=lambda value:print(value,file=sys.stderr))
        client.open(args.mode,args.modulation,args.action.upper(),args.hz)
        if args.action=='tx':
            print('Transmitting explicit TX audio; selected radio channel metadata/TOT apply.',file=sys.stderr)
            client.transmit(pcm)
        elif args.raw:
            with args.file.open('xb') as output:client.receive(output.write,args.seconds)
        else:
            with args.file.open('xb') as output:
                with wave.open(output,'wb') as wav:
                    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000)
                    client.receive(wav.writeframesraw,args.seconds)
    except KeyboardInterrupt:
        print('Stopping PCM session.',file=sys.stderr);result=130
    except Exception as error:
        print(str(error),file=sys.stderr);result=1
    finally:
        if client:
            try:client.stop()
            except Exception as error:print('STOP acknowledgement unavailable: '+str(error),file=sys.stderr);result=result or 1
            if args.action=='rx' and args.file.exists():
                try:write_report(args.file,client.report)
                except OSError as error:print('Could not save capture report: '+str(error),file=sys.stderr);result=result or 1
            print(json.dumps(asdict(client.report),sort_keys=True),file=sys.stderr)
        if port:port.close()
    return result

if __name__=='__main__':raise SystemExit(main())
