#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Compile, inspect and explicitly manage installable DM32 sandbox applets."""
import argparse
from pathlib import Path
import sys
from dm32_applet import AppletClient,compile_source,load_package,open_port,package_json


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='action',required=True)
    compile_parser=commands.add_parser('compile',help='Compile applet source offline')
    compile_parser.add_argument('source',type=Path)
    compile_parser.add_argument('-o','--output',type=Path)
    inspect_parser=commands.add_parser('inspect',help='Validate and inspect source or a DAPP package offline')
    inspect_parser.add_argument('package',type=Path)
    install_parser=commands.add_parser('install',help='Install into a slot without running or formatting storage')
    install_parser.add_argument('package',type=Path)
    install_parser.add_argument('--slot',type=int,choices=range(1,9),required=True)
    for action in ('list','run','remove','stop'):
        command_parser=commands.add_parser(action)
        if action in ('run','remove'):command_parser.add_argument('slot',type=int,choices=range(1,9))
    for name in ('install','list','run','remove','stop'):
        commands.choices[name].add_argument('--port',default='COM8')
    args=parser.parse_args(argv)
    port=None
    try:
        if args.action=='compile':
            if args.source.stat().st_size>262144:raise ValueError('Source exceeds 256 KiB.')
            package=compile_source(args.source.read_text(encoding='utf-8'))
            target=args.output or args.source.with_suffix('.dapp')
            if target.resolve()==args.source.resolve():raise ValueError('Output must differ from source.')
            target.write_bytes(package.data)
            print(f'Wrote {target} ({len(package.data)} bytes)')
            print(package_json(package));return 0
        if args.action=='inspect':print(package_json(load_package(args.package)));return 0
        # Validate entirely before opening serial or starting a flash operation.
        package=load_package(args.package) if args.action=='install' else None
        port=open_port(args.port)
        client=AppletClient(port,on_output=lambda line:print(line,flush=True))
        if args.action=='install':client.install(args.slot,package)
        elif args.action=='list':client.store_status()
        elif args.action=='run':client.run(args.slot)
        elif args.action=='remove':client.remove(args.slot)
        else:client.stop()
        return 0
    except KeyboardInterrupt:
        print('Interrupted.',file=sys.stderr);return 130
    except ImportError:
        print('Install pyserial: python -m pip install -r requirements-bench.txt',file=sys.stderr);return 1
    except Exception as error:
        print(str(error),file=sys.stderr);return 1
    finally:
        if port is not None:port.close()


if __name__=='__main__':raise SystemExit(main())
