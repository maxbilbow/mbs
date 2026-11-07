"""Generate original pack assets with Python 3 and the system libsndfile."""

import ctypes
import ctypes.util
import math
from pathlib import Path
import random
import struct
import zlib

ROOT = Path(__file__).resolve().parent / "resource"
RATE = 24000


class SoundInfo(ctypes.Structure):
    _fields_ = [
        ("frames", ctypes.c_int64),
        ("samplerate", ctypes.c_int),
        ("channels", ctypes.c_int),
        ("format", ctypes.c_int),
        ("sections", ctypes.c_int),
        ("seekable", ctypes.c_int),
    ]


def generate_sounds():
    library = ctypes.util.find_library("sndfile")
    if not library:
        raise RuntimeError("Install libsndfile to regenerate the original Ogg sounds.")
    encoder = ctypes.CDLL(library)
    encoder.sf_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(SoundInfo)]
    encoder.sf_open.restype = ctypes.c_void_p
    encoder.sf_write_float.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int64
    ]
    encoder.sf_write_float.restype = ctypes.c_int64
    encoder.sf_close.argtypes = [ctypes.c_void_p]
    encoder.sf_close.restype = ctypes.c_int
    encoder.sf_strerror.argtypes = [ctypes.c_void_p]
    encoder.sf_strerror.restype = ctypes.c_char_p
    destination = ROOT / "sounds" / "fart"
    destination.mkdir(parents=True, exist_ok=True)
    for name, duration in [("small", 0.4), ("medium", 0.8), ("large", 1.6), ("huge", 3.0)]:
        rng = random.Random(42)
        count = round(duration * RATE)
        samples = (ctypes.c_float * count)()
        phase = 0.0
        noise = 0.0
        for index in range(count):
            time = index / RATE
            progress = time / duration
            frequency = 95 - 40 * progress + 12 * math.sin(2 * math.pi * 9 * time)
            phase += 2 * math.pi * frequency / RATE
            noise = 0.65 * noise + 0.35 * rng.uniform(-1, 1)
            buzz = math.tanh(4 * math.sin(phase))
            flutter = 0.7 + 0.3 * math.sin(2 * math.pi * 23 * time)
            envelope = min(1, time / 0.02, (duration - time) / 0.08)
            samples[index] = 0.65 * envelope * flutter * (0.7 * buzz + 0.3 * noise)
        info = SoundInfo(0, RATE, 1, 0x200000 | 0x0060, 0, 0)  # Ogg Vorbis, mono
        path = destination / f"{name}.ogg"
        handle = encoder.sf_open(str(path).encode(), 0x20, ctypes.byref(info))
        if not handle:
            raise RuntimeError(encoder.sf_strerror(None).decode())
        try:
            if encoder.sf_write_float(handle, samples, count) != count:
                raise RuntimeError(encoder.sf_strerror(handle).decode())
        finally:
            if encoder.sf_close(handle) != 0:
                raise RuntimeError(f"Failed to close {path}")
        print(f"Generated {path} ({duration}s)")


def generate_texture():
    palette = {
        ".": (0, 0, 0, 0),
        "#": (60, 65, 71, 255),
        "s": (164, 178, 187, 255),
        "h": (227, 234, 237, 255),
        "r": (164, 44, 36, 255),
        "c": (243, 223, 165, 255),
        "b": (166, 94, 46, 255),
    }
    rows = [
        "................",
        "................",
        "....########....",
        "...#sshhhsss#...",
        "...#hsssssss#...",
        "...#rrrrrrrr#...",
        "...#rccccccr#...",
        "...#rcbbcbcr#...",
        "...#rcbcbbcr#...",
        "...#rcbbcbcr#...",
        "...#rccccccr#...",
        "...#rrrrrrrr#...",
        "...#sssssssh#...",
        "...#sshhhsss#...",
        "....########....",
        "................",
    ]

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    pixels = b"".join(
        b"\0" + b"".join(bytes(palette[pixel]) for pixel in row) for row in rows
    )
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", 16, 16, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(pixels))
    png += chunk(b"IEND", b"")
    path = ROOT / "textures" / "items" / "tin_of_beans.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f"Generated {path}")


if __name__ == "__main__":
    generate_sounds()
    generate_texture()
