#!/usr/bin/env python3
"""
TitanNVR - Test Data Generator
Generates mock camera data for performance testing
"""
import json
import random
from pathlib import Path

# Configuration
NUM_CAMERAS = 32
OUTPUT_FILE = Path(__file__).parent.parent / "cameras_mock.json"
# Streams de prueba alternativos (HTTP funcionan mejor en Docker)
TEST_STREAMS = [
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
]

# Groups distribution (32 cameras / 4 groups = 8 per group)
GROUPS = ["Planta Baja", "Piso 1", "Piso 2", "Exterior"]

def generate_cameras():
    """Generate mock camera data."""
    cameras = []
    
    for i in range(1, NUM_CAMERAS + 1):
        # Sequential name with zero-padding
        name = f"Camara {i:02d}"
        
        # Distribute groups evenly (8 cameras per group)
        group_index = (i - 1) // 8
        group = GROUPS[group_index]
        
        # Alternate recording modes: even = motion, odd = events
        recording_mode = "motion" if i % 2 == 0 else "events"
        
        # Random retention between 3 and 15 days
        retention_days = random.randint(3, 15)
        
        # Rotate through test streams
        stream_url = TEST_STREAMS[(i - 1) % len(TEST_STREAMS)]
        
        camera = {
            "name": name,
            "main_stream_url": stream_url,
            "sub_stream_url": stream_url,
            "group": group,
            "location": f"{group} - Zona {((i - 1) % 8) + 1}",
            "retention_days": retention_days,
            "recording_mode": recording_mode
        }
        
        cameras.append(camera)
    
    return cameras

def main():
    # Generate cameras
    cameras = generate_cameras()
    
    # Write to JSON file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cameras, f, indent=2, ensure_ascii=False)
    
    # Summary
    print(f"✅ Archivo cameras_mock.json generado con {len(cameras)} cámaras. Listo para importar en TitanNVR.")
    print(f"\n📁 Ubicación: {OUTPUT_FILE}")
    print(f"\n📊 Distribución por grupo:")
    for group in GROUPS:
        count = len([c for c in cameras if c['group'] == group])
        print(f"   • {group}: {count} cámaras")
    
    print(f"\n🎬 Modos de grabación:")
    motion_count = len([c for c in cameras if c['recording_mode'] == 'motion'])
    events_count = len([c for c in cameras if c['recording_mode'] == 'events'])
    print(f"   • Motion: {motion_count} cámaras")
    print(f"   • Events: {events_count} cámaras")

if __name__ == "__main__":
    main()
