#!/usr/bin/env python3
"""Render the existing SVG volleyball paths into iOS PNG assets (macOS/Swift)."""
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'ios/App/App/Assets.xcassets'
svg = ET.parse(ROOT / 'assets/branding/icon.svg')
commands = []
for element in svg.iter('{http://www.w3.org/2000/svg}path'):
    color = element.attrib['fill'].lstrip('#')
    rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    commands.append('context.setFillColor(CGColor(red: %s, green: %s, blue: %s, alpha: 1))' % tuple(rgb))
    commands.append('let path%d = CGMutablePath()' % len(commands))
    name = commands[-1].split()[1]
    tokens = re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)', element.attrib['d'])
    x = y = start_x = start_y = 0.0
    index = 0
    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
        if command.lower() == 'z':
            commands.append(f'{name}.closeSubpath()')
            x, y = start_x, start_y
            continue
        count = {'m': 2, 'l': 2, 'h': 1, 'v': 1, 'c': 6}[command.lower()]
        values = list(map(float, tokens[index:index + count]))
        index += count
        relative = command.islower()
        kind = command.lower()
        if kind in ('m', 'l', 'c'):
            points = [(values[j] + (x if relative else 0), values[j + 1] + (y if relative else 0)) for j in range(0, count, 2)]
            x, y = points[-1]
        elif kind == 'h':
            x = values[0] + (x if relative else 0)
        elif kind == 'v':
            y = values[0] + (y if relative else 0)
        if kind == 'm':
            start_x, start_y = x, y
            commands.append(f'{name}.move(to: CGPoint(x: {x}, y: {y}))')
            command = 'l' if relative else 'L'
        elif kind == 'c':
            point = lambda p: f'CGPoint(x: {p[0]}, y: {p[1]})'
            commands.append(f'{name}.addCurve(to: {point(points[2])}, control1: {point(points[0])}, control2: {point(points[1])})')
        else:
            commands.append(f'{name}.addLine(to: CGPoint(x: {x}, y: {y}))')
    commands.extend([f'context.addPath({name})', 'context.fillPath()'])

source = '''import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Foundation
func render(size: Int, icon: Bool, output: String) throws {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: (icon ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast).rawValue)!
    context.translateBy(x: 0, y: CGFloat(size))
    context.scaleBy(x: 1, y: -1)
    if icon {
        context.setFillColor(CGColor(red: 14/255.0, green: 18/255.0, blue: 32/255.0, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: size, height: size))
        let unit = CGFloat(size) / 108
        context.translateBy(x: 18 * unit, y: 18 * unit)
        context.scaleBy(x: 3 * unit, y: 3 * unit)
    } else {
        context.clear(CGRect(x: 0, y: 0, width: size, height: size))
        context.scaleBy(x: CGFloat(size)/24, y: CGFloat(size)/24)
    }
''' + '\n'.join(commands) + '''
    let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Could not write PNG") }
}
'''
source += f'try render(size: 1024, icon: true, output: {json.dumps(str(ASSETS / "AppIcon.appiconset/AppIcon-512@2x.png"))})\n'
for scale in (1, 2, 3):
    source += f'try render(size: {192 * scale}, icon: false, output: {json.dumps(str(ASSETS / f"Splash.imageset/volleyball@{scale}x.png"))})\n'
with tempfile.TemporaryDirectory(prefix='volleyball-branding-') as directory:
    swift = Path(directory) / 'render.swift'
    swift.write_text(source)
    subprocess.run(['swift', '-module-cache-path', str(Path(tempfile.gettempdir()) / 'volleyball-swift-cache'), str(swift)], check=True)
print('Generated iOS app icon and launch images from assets/branding/icon.svg')
