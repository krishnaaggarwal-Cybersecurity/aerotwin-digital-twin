import math
import subprocess
import wave
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "frontend" / "public" / "demo"
WORK = DEMO / "walkthrough-work"
WIDTH, HEIGHT, FPS = 1280, 720, 24
MINT = "#65D8BF"

SCENES = [
    {
        "title": "AEROTWIN",
        "kicker": "THE PROTOTYPE IN 90 SECONDS",
        "subtitle": "A digital-twin workflow for synthetic engine-health monitoring",
        "tag": "START HERE",
        "metrics": [("LIVE TWIN", "SIMULATED"), ("ENGINE", "PISTON"), ("MODE", "DEMONSTRATOR")],
        "kind": "intro",
        "narration": "Welcome to AeroTwin: an interactive digital-twin prototype for monitoring a synthetic aero piston engine. This short walkthrough explains the two concept clips, then shows what the working prototype actually does.",
    },
    {
        "title": "TWO CONCEPT CLIPS",
        "kicker": "WHAT THE SUPPLIED VIDEOS SHOW",
        "subtitle": "Illustrative visuals - not recordings of this application",
        "tag": "IMPORTANT CONTEXT",
        "metrics": [("CLIP 01", "EMERGENCY SCENARIO"), ("CLIP 02", "FLIGHT MONITORING"), ("ACTUAL SYSTEM", "NOT SHOWN")],
        "kind": "clips",
        "narration": "The first supplied clip depicts an aircraft emergency scenario. The second shows a flight-monitoring and safe-landing concept. Both are illustrative visuals only. They are not recordings of AeroTwin, real UAV footage from this application, or evidence that crash detection or emergency dispatch is connected.",
    },
    {
        "title": "TELEMETRY -> TWIN",
        "kicker": "01 / A LIVE SOFTWARE MODEL",
        "subtitle": "One changing synthetic snapshot drives the connected views",
        "tag": "SIMULATED SIGNALS",
        "metrics": [("RPM", "ENGINE SPEED"), ("DEG C", "THERMAL"), ("BAR", "PRESSURE"), ("MM/S", "VIBRATION")],
        "kind": "telemetry",
        "narration": "In the prototype, a simulator generates changing engine telemetry: RPM, temperatures, oil and fuel pressures, fuel flow, vibration, and operating conditions. The digital twin updates from that stream, and the dashboard visualizes the same selected engine state as it changes.",
    },
    {
        "title": "EARLY-WARNING EVIDENCE",
        "kicker": "02 / DETECT - CLASSIFY - EXPLAIN",
        "subtitle": "Model outputs are visible beside the signals that informed them",
        "tag": "SYNTHETIC-TRAINED ML",
        "metrics": [("ANOMALY", "ISOLATION FOREST"), ("FAULT CLASS", "RANDOM FOREST"), ("EVIDENCE", "SIGNAL EXPLANATIONS")],
        "kind": "models",
        "narration": "For early warning, an Isolation Forest looks for unusual sensor patterns, while a Random Forest classifies simulated fault types. The interface shows the predicted class, confidence, and contributing signals. Both models were trained on generated synthetic data, not validated real-engine recordings.",
    },
    {
        "title": "HEALTH & MISSION CONTEXT",
        "kicker": "03 / TURN SIGNALS INTO A STORY",
        "subtitle": "Understand how a simulated fault affects the engine and mission",
        "tag": "NOT CERTIFIED OUTPUT",
        "metrics": [("COMPONENT HEALTH", "ESTIMATED"), ("REMAINING LIFE", "SIMULATED"), ("MISSION SCORE", "SIMULATED")],
        "kind": "mission",
        "narration": "Component health and the remaining-life indicator are simulated estimates. Mission reliability combines twin health and simulated mission phases to make the impact of a fault easier to understand. These numbers are demonstrations, not certified airworthiness or service-life decisions.",
    },
    {
        "title": "A FLEET OF VIRTUAL AIRCRAFT",
        "kicker": "04 / SELECT - CONTROL - OBSERVE",
        "subtitle": "The virtual UAV view follows the selected engine twin",
        "tag": "NO HARDWARE LINK",
        "metrics": [("FLEET", "3 VIRTUAL TWINS"), ("ROUTE", "VISUAL SIMULATION"), ("FAULTS", "DEMO INJECTION")],
        "kind": "fleet",
        "narration": "The fleet view lets you select among independent virtual engines. The virtual UAV page visualizes a route linked to the selected engine. You can pause, resume, and inject demonstration faults. These controls affect software simulation only; they do not pilot a real aircraft.",
    },
    {
        "title": "ASK QUESTIONS. CHECK YOUR DATA.",
        "kicker": "05 / OPERATOR WORKBENCH",
        "subtitle": "Assistant answers use current twin evidence; CSV checks are prototype rules",
        "tag": "TWIN-AWARE TOOLS",
        "metrics": [("ASSISTANT", "SNAPSHOT ATTACHED"), ("DATA LAB", "CSV TREND CHECK"), ("AI API", "OPTIONAL BACKEND")],
        "kind": "workbench",
        "narration": "The assistant receives the latest twin snapshot with each question. On the public static site, it uses browser-side evidence routing; a backend can optionally call a configured language model. The Data Lab checks uploaded CSV signals for configured limit breaches and persistent trends. Prototype thresholds are not validated operating limits.",
    },
    {
        "title": "A CLEAR SAFETY BOUNDARY",
        "kicker": "06 / WHAT THIS PROTOTYPE DOES NOT DO",
        "subtitle": "No real crash detection, responder lookup, SOS dispatch, or flight control",
        "tag": "SOFTWARE DEMO ONLY",
        "metrics": [("SOS DRILL", "PREVIEW ONLY"), ("ENGINE", "SYNTHETIC"), ("UAV", "VIRTUAL")],
        "kind": "safety",
        "narration": "The dashboard SOS drill only previews a simulated incident brief. It does not detect a real crash, locate responders, or send an alert. In summary, AeroTwin demonstrates a connected monitoring workflow: telemetry, twin, anomaly evidence, fault classification, health, mission context, and operator-facing explanations, all inside a safe synthetic prototype.",
    },
]


def load_font(filename, size):
    path = Path("C:/Windows/Fonts") / filename
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def wrap_text(draw, text, selected_font, max_width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=selected_font)[2] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def scene_duration(path):
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def subtitle_cues(text, seconds):
    sentences = [f"{part.strip()}." for part in text.replace("!", ".").replace("?", ".").split(".") if part.strip()]
    weights = [max(1, len(sentence.split())) for sentence in sentences]
    total_words = sum(weights)
    elapsed, result = 0.0, []
    for sentence, weight in zip(sentences, weights):
        start = elapsed
        elapsed += seconds * weight / total_words
        result.append((start, elapsed, sentence))
    return result


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02}.{milliseconds:03}"


def render_scene(scene, progress, caption, index, fonts):
    kicker_font, title_font, body_font, small_font, card_font, metric_font = fonts
    image = Image.new("RGB", (WIDTH, HEIGHT), (5, 15, 23))
    draw = ImageDraw.Draw(image, "RGBA")
    for x in range(0, WIDTH, 48):
        draw.line((x, 0, x, HEIGHT), fill=(43, 73, 80, 40))
    for y in range(0, HEIGHT, 48):
        draw.line((0, y, WIDTH, y), fill=(43, 73, 80, 32))
    draw.rectangle((22, 20, WIDTH - 22, HEIGHT - 20), outline=(72, 128, 134, 115))
    draw.rounded_rectangle((52, 40, 260, 74), radius=7, fill=(16, 53, 60, 220), outline=(85, 196, 177, 150))
    draw.text((68, 48), "AEROTWIN / TWIN LAB", font=small_font, fill=MINT)
    draw.text((WIDTH - 255, 50), "SYNTHETIC DEMONSTRATOR", font=small_font, fill=(151, 183, 187))
    draw.text((58, 104), scene["kicker"], font=kicker_font, fill=MINT)
    draw.text((56, 137), scene["title"], font=title_font, fill=(239, 248, 247))
    draw.text((59, 207), scene["subtitle"], font=body_font, fill=(166, 194, 197))
    draw.rounded_rectangle((56, 270, 627, 558), radius=16, fill=(10, 28, 37, 240), outline=(52, 91, 99, 220))
    draw.rounded_rectangle((653, 270, 1224, 558), radius=16, fill=(10, 28, 37, 240), outline=(52, 91, 99, 220))
    draw.text((82, 291), scene["tag"], font=kicker_font, fill=MINT)
    draw.line((82, 323, 601, 323), fill=(50, 91, 96, 180))

    kind = scene["kind"]
    if kind == "intro":
        cx, cy = 340, 433
        for radius in (104, 77, 49):
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(101, 216, 191, 95), width=2)
        angle = progress * math.tau
        dot_x, dot_y = cx + math.cos(angle) * 104, cy + math.sin(angle) * 104
        draw.ellipse((dot_x - 7, dot_y - 7, dot_x + 7, dot_y + 7), fill=MINT)
        draw.rounded_rectangle((cx - 46, cy - 31, cx + 46, cy + 31), radius=12, fill=(25, 80, 84), outline=MINT, width=2)
        draw.text((cx - 28, cy - 13), "TWIN", font=card_font, fill=(235, 251, 249))
        draw.text((90, 515), "ENGINE TELEMETRY  >  DIGITAL TWIN  >  OPERATOR VIEW", font=small_font, fill=(164, 198, 199))
    elif kind == "clips":
        for x, label, copy in ((83, "CLIP 01", "Emergency concept"), (354, "CLIP 02", "Flight HUD concept")):
            draw.rounded_rectangle((x, 350, x + 245, 503), radius=12, fill=(15, 42, 49), outline=(67, 111, 118))
            draw.text((x + 18, 367), label, font=kicker_font, fill=MINT)
            if label.endswith("01"):
                draw.polygon(((x + 45, 445), (x + 105, 405), (x + 202, 441), (x + 124, 451), (x + 98, 476)), fill=(62, 112, 117, 220))
                draw.line((x + 62, 450, x + 182, 450), fill=(227, 156, 111, 220), width=3)
            else:
                draw.line((x + 20, 438, x + 220, 438), fill=(64, 207, 181, 160), width=2)
                draw.arc((x + 72, 388, x + 170, 480), 180, 340, fill=MINT, width=3)
                draw.rounded_rectangle((x + 74, 418, x + 168, 450), radius=5, outline=MINT, width=2)
            draw.text((x + 18, 477), copy, font=small_font, fill=(208, 224, 222))
        draw.text((82, 520), "CONCEPT IMAGERY / NOT A CONNECTED DEMONSTRATION", font=small_font, fill=(242, 187, 132))
    elif kind == "telemetry":
        values = (0.78 + 0.07 * math.sin(progress * 8), 0.46 + 0.18 * progress, 0.84 - 0.18 * progress, 0.30 + 0.28 * progress)
        for row, (label, value) in enumerate(zip(("RPM", "CYL TEMP", "OIL PRESS", "VIBRATION"), values)):
            y = 350 + row * 45
            draw.text((85, y), label, font=small_font, fill=(188, 217, 216))
            draw.rounded_rectangle((220, y + 2, 565, y + 22), radius=8, fill=(27, 57, 63))
            draw.rounded_rectangle((220, y + 2, 220 + 345 * max(0.06, min(0.98, value)), y + 22), radius=8, fill=MINT if row < 2 else "#E4B86C")
            draw.text((575, y), f"{int(value * 100)}%", font=small_font, fill=(226, 241, 239))
        draw.text((84, 532), "CHANGING SIGNALS / ONE SELECTED ENGINE", font=small_font, fill=(164, 198, 199))
    elif kind == "models":
        steps = (("01  DETECT", "Unusual sensor pattern"), ("02  CLASSIFY", "Likely simulated fault"), ("03  EXPLAIN", "Values and contribution"))
        for row, (heading, detail) in enumerate(steps):
            y = 350 + row * 59
            done = progress >= row * 0.19
            draw.ellipse((88, y, 119, y + 31), fill=MINT if done else (37, 67, 71))
            draw.text((96, y + 5), str(row + 1), font=small_font, fill=(4, 26, 30) if done else (182, 211, 211))
            draw.text((140, y - 2), heading, font=card_font, fill=(227, 245, 242))
            draw.text((140, y + 27), detail, font=small_font, fill=(155, 189, 190))
    elif kind == "mission":
        for i, (label, value) in enumerate((("ENGINE HEALTH", .78), ("MISSION SCORE", .68), ("RUL INDICATOR", .54))):
            x = 91 + i * 169
            draw.ellipse((x, 363, x + 130, 493), outline=(47, 79, 85), width=12)
            draw.arc((x, 363, x + 130, 493), -90, -90 + 360 * value, fill=MINT, width=12)
            draw.text((x + 30, 410), f"{int(value * 100)}%", font=card_font, fill=(231, 248, 245))
            for line_index, line in enumerate(wrap_text(draw, label, small_font, 140)):
                draw.text((x + 5, 509 + line_index * 19), line, font=small_font, fill=(167, 197, 197))
    elif kind == "fleet":
        selected = min(2, int(progress * 3))
        for row in range(3):
            y = 355 + row * 55
            active = row == selected
            draw.rounded_rectangle((86, y, 590, y + 43), radius=8, fill=(18, 61, 65) if active else (15, 37, 44), outline=MINT if active else (48, 76, 82))
            draw.text((104, y + 10), f"APT-MALE-SIM-0{row + 1}", font=small_font, fill=(228, 245, 243))
            draw.text((425, y + 10), ("HEALTHY", "WATCH", "HEALTHY")[row], font=small_font, fill=MINT if row != 1 else "#E4B86C")
    elif kind == "workbench":
        draw.rounded_rectangle((85, 355, 596, 447), radius=10, fill=(14, 41, 49), outline=(52, 99, 106))
        draw.text((105, 369), "ASK THE SELECTED TWIN", font=kicker_font, fill=MINT)
        draw.text((105, 400), '"What signal is most concerning?"', font=body_font, fill=(228, 244, 241))
        for i, (label, value) in enumerate((("CSV SIGNALS", .62), ("PERSISTENT TREND", .78), ("EVIDENCE CHECK", .54))):
            x = 91 + i * 167
            draw.text((x, 474), label, font=load_font("seguisb.ttf", 13), fill=(178, 207, 205))
            draw.rectangle((x, 502, x + 138, 510), fill=(35, 65, 70))
            draw.rectangle((x, 502, x + 138 * value, 510), fill=MINT)
    elif kind == "safety":
        draw.rounded_rectangle((86, 355, 594, 482), radius=12, fill=(44, 36, 28), outline=(200, 145, 86), width=2)
        draw.text((110, 376), "SOS DRILL", font=kicker_font, fill=(244, 192, 132))
        draw.text((110, 414), "PREVIEW ONLY", font=load_font("seguisb.ttf", 31), fill=(255, 235, 207))
        draw.text((110, 463), "No alert is sent. No responder is contacted.", font=small_font, fill=(225, 204, 179))
        draw.text((90, 518), "SYNTHETIC DATA / NO FLIGHT CONTROL / NO REAL UAV", font=load_font("seguisb.ttf", 14), fill=(185, 205, 202))

    draw.text((680, 291), "PROTOTYPE FLOW", font=kicker_font, fill=MINT)
    flow = ("SIMULATE TELEMETRY", "UPDATE ENGINE TWIN", "SURFACE MODEL EVIDENCE", "SHOW OPERATOR CONTEXT")
    for row, label in enumerate(flow):
        y = 346 + row * 47
        done = progress >= row / len(flow)
        draw.ellipse((685, y, 702, y + 17), fill=MINT if done else (40, 69, 75))
        draw.text((721, y - 4), label, font=card_font if row == int(progress * 4) else small_font, fill=(232, 246, 243) if done else (137, 169, 172))
        if row < 3:
            draw.line((693, y + 19, 693, y + 38), fill=(68, 115, 117, 180), width=2)
    draw.line((680, 538, 1197, 538), fill=(50, 91, 96, 180))
    for metric_index, (label, value) in enumerate(scene["metrics"]):
        x = 680 + (metric_index % 2) * 265
        if metric_index < 2:
            draw.text((x, 554), label, font=metric_font, fill=(231, 246, 243))
            draw.text((x, 581), value, font=small_font, fill=MINT)
        else:
            draw.text((1197, 554), label, font=metric_font, fill=(231, 246, 243), anchor="ra")
            tint = "#F2BB84" if label in ("ACTUAL SYSTEM", "ENGINE", "UAV") else MINT
            draw.text((1197, 581), value, font=small_font, fill=tint, anchor="ra")

    draw.rectangle((56, 621, 1224, 627), fill=(34, 65, 70))
    draw.rectangle((56, 621, 56 + 1168 * progress, 627), fill=MINT)
    draw.text((58, 638), "AEROTWIN / PROTOTYPE WALKTHROUGH", font=small_font, fill=(160, 190, 190))
    draw.text((1221, 638), f"{int(progress * 100):02d}%  /  CHAPTER {index + 1:02d}", font=small_font, fill=(160, 190, 190), anchor="ra")
    draw.rounded_rectangle((178, 665, 1102, 708), radius=8, fill=(4, 12, 17, 232), outline=(74, 125, 126, 180))
    caption_lines = wrap_text(draw, caption, small_font, 875)[:2]
    y = 665 + (43 - len(caption_lines) * 21) // 2
    for line in caption_lines:
        draw.text((640, y), line, font=small_font, fill=(244, 250, 247), anchor="ma")
        y += 21
    return np.asarray(image)


def main():
    if not WORK.exists():
        raise FileNotFoundError(f"Voiceover folder is missing: {WORK}")
    fonts = (
        load_font("seguisb.ttf", 17),
        load_font("seguisb.ttf", 46),
        load_font("segoeui.ttf", 24),
        load_font("segoeui.ttf", 16),
        load_font("seguisb.ttf", 20),
        load_font("seguisb.ttf", 19),
    )
    wave_paths = [WORK / f"scene-{i:02}.wav" for i in range(1, len(SCENES) + 1)]
    durations = [scene_duration(path) for path in wave_paths]
    print("Scene durations:", [round(duration, 1) for duration in durations], "total:", round(sum(durations), 1))

    master_wav = WORK / "narration.wav"
    with wave.open(str(wave_paths[0]), "rb") as first:
        params = first.getparams()
    with wave.open(str(master_wav), "wb") as master:
        master.setparams(params)
        for path in wave_paths:
            with wave.open(str(path), "rb") as segment:
                if segment.getparams()[:3] != params[:3] or segment.getparams()[4:] != params[4:]:
                    raise ValueError(f"Voice formats differ: {path}")
                master.writeframes(segment.readframes(segment.getnframes()))

    silent_mp4 = WORK / "silent.mp4"
    writer = cv2.VideoWriter(str(silent_mp4), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError("OpenCV could not initialize its MP4 video writer")

    cues, elapsed, previous = [], 0.0, None
    poster = DEMO / "project-walkthrough-poster.jpg"
    for index, (scene, seconds) in enumerate(zip(SCENES, durations)):
        local_cues = subtitle_cues(scene["narration"], seconds)
        cues.extend((elapsed + start, elapsed + end, text) for start, end, text in local_cues)
        frame_count = math.ceil(seconds * FPS)
        for frame_index in range(frame_count):
            current_time = frame_index / FPS
            progress = min(1.0, current_time / max(seconds, 0.1))
            caption = next((text for start, end, text in local_cues if start <= current_time < end), local_cues[-1][2])
            rgb = render_scene(scene, progress, caption, index, fonts)
            if frame_index < 10 and previous is not None:
                rgb = cv2.addWeighted(previous, 1 - (frame_index + 1) / 10, rgb, (frame_index + 1) / 10, 0)
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            writer.write(bgr)
            if index == 0 and frame_index == FPS:
                cv2.imwrite(str(poster), bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
        previous = render_scene(scene, 1.0, "", index, fonts)
        elapsed += frame_count / FPS
    writer.release()

    captions_path = DEMO / "project-walkthrough-en.vtt"
    with captions_path.open("w", encoding="utf-8", newline="\n") as captions:
        captions.write("WEBVTT\n\n")
        for start, end, text in cues:
            captions.write(f"{timestamp(start)} --> {timestamp(end)}\n{text}\n\n")

    final_mp4 = DEMO / "project-walkthrough.mp4"
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", str(silent_mp4), "-i", str(master_wav),
        "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest",
        "-metadata", "title=AeroTwin Prototype Walkthrough",
        "-metadata", "comment=Explanatory synthetic prototype walkthrough",
        "-f", "mp4", str(final_mp4),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    print("Created:", final_mp4, "bytes:", final_mp4.stat().st_size)
    print("Captions:", captions_path.stat().st_size, "bytes; poster:", poster.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
