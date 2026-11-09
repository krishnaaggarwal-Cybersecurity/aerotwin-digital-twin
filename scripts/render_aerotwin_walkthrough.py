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
WORK = ROOT / "scripts" / "walkthrough-work"
WIDTH, HEIGHT, FPS = 1280, 720, 24
MINT = (56, 205, 166)
SCENES = [
    {
        "image": "live-dashboard.jpg",
        "title": "Welcome to the live prototype",
        "subtitle": "The current browser app, captured on screen",
        "focus": (887, 380),
        "narration": "Welcome to AeroTwin! This is the running prototype itself, captured screen by screen. I’ll show you what’s actually working—from changing engine readings, to the model evidence, to the operator tools. Let’s jump in.",
    },
    {
        "image": "live-dashboard.jpg",
        "title": "Flightline overview",
        "subtitle": "Selected engine, live synthetic telemetry, and twin health",
        "focus": (920, 363),
        "narration": "Start with Flightline Overview. The selected virtual engine is right here. RPM, cylinder temperature, oil pressure, and anomaly score are updating together. This is a working software simulation—not a mockup—but every reading is synthetic. No real engine or aircraft is connected.",
    },
    {
        "image": "live-telemetry.jpg",
        "title": "Follow each sensor",
        "subtitle": "Telemetry cards and time-series trends",
        "focus": (752, 495),
        "narration": "Open Telemetry. Here are the live sensor cards, and below them, the trends the twin sees. Temperature, pressure, vibration, and fuel signals are tracked together so you can follow what changes, and when.",
    },
    {
        "image": "live-prediction.jpg",
        "title": "See what the models see",
        "subtitle": "Separate fault classification from anomaly detection",
        "focus": (977, 428),
        "narration": "Now Fault Prediction. Random Forest classifies the simulated fault; Isolation Forest checks for unusual patterns. These are separate signals: the current screen shows a Normal class at 91.2 percent confidence and a zero anomaly score. Try a simulated fault and watch the evidence change. The models were trained on synthetic data, not real engine test records.",
    },
    {
        "image": "live-digital-twin.jpg",
        "title": "Inspect the digital twin",
        "subtitle": "Interactive reference geometry, linked to the selected twin",
        "focus": (610, 480),
        "narration": "This is the actual Digital Twin inspection view: a three-dimensional reference engine alongside the selected twin’s condition. You can rotate the model and inspect its mapped components. It is a visual reference, not a sensor-equipped, physically synchronized engine.",
    },
    {
        "image": "live-mission.jpg",
        "title": "Put health in mission context",
        "subtitle": "Transparent phase-by-phase simulated reliability",
        "focus": (750, 424),
        "narration": "Mission Reliability turns the current simulated condition into a phase-by-phase mission picture. Explore how the score and modeled risk respond to engine health. This is a transparent prototype indicator—not a certified probability of mission success.",
    },
    {
        "image": "live-fleet.jpg",
        "title": "Switch between virtual aircraft",
        "subtitle": "Three isolated engine-twin simulations",
        "focus": (780, 475),
        "narration": "Fleet runs three isolated virtual engine twins. Select another one to change which engine feeds the main dashboard. Each is a separate software simulation, not a real aircraft connection.",
    },
    {
        "image": "live-uav.jpg",
        "title": "Link a virtual UAV to its engine",
        "subtitle": "Illustrative route only — no hardware connection",
        "focus": (595, 475),
        "narration": "On Virtual UAV, watch the illustrative route and linked engine readings side by side. Route progress follows the software simulation, and the page explicitly says it is not a navigation map. Nothing here sends commands to a real aircraft.",
    },
    {
        "image": "live-assistant-answer.jpg",
        "title": "Ask about the selected twin",
        "subtitle": "The public demo answers from the latest synthetic snapshot",
        "focus": (570, 300),
        "narration": "Now ask the assistant a question about the selected engine. The public demo answers from the latest synthetic twin snapshot, so the response changes with the evidence. This browser version does not connect to a hosted language model; an optional model is only configured on the backend.",
    },
    {
        "image": "live-data-lab.jpg",
        "title": "Analyze your own telemetry CSV",
        "subtitle": "Baseline, configured limits, and persistent-change checks",
        "focus": (912, 402),
        "narration": "The Data Lab is where you can bring a CSV. It establishes a measured baseline, checks configured signal limits, and looks for persistent changes across consecutive samples. These are prototype screening rules—not validated engine limits.",
    },
    {
        "image": "live-sos-drill.jpg",
        "title": "Safety boundary: preview only",
        "subtitle": "No real crash detection, responder lookup, or SOS dispatch",
        "focus": (690, 415),
        "narration": "Finally, the SOS drill. It previews an incident brief for demonstration only. It does not detect a real crash, find a help center, or send an SOS. That is AeroTwin today: a connected, interactive software prototype for exploring the monitoring workflow—clearly synthetic, and not connected to a real aircraft.",
    },
]


def load_font(filename: str, size: int):
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


def audio_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def captions_for(text: str, duration: float):
    sentences = [
        f"{part.strip()}."
        for part in text.replace("!", ".").replace("?", ".").split(".")
        if part.strip()
    ]
    weights = [max(1, len(sentence.split())) for sentence in sentences]
    elapsed, total_words, cues = 0.0, sum(weights), []
    for sentence, weight in zip(sentences, weights):
        start = elapsed
        elapsed += duration * weight / total_words
        cues.append((start, elapsed, sentence))
    return cues


def timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02}.{milliseconds:03}"


def camera_frame(source: np.ndarray, progress: float, focus: tuple[int, int]) -> np.ndarray:
    zoom = 1.0 + 0.035 * progress
    crop_width, crop_height = int(WIDTH / zoom), int(HEIGHT / zoom)
    pan_x = int((focus[0] - WIDTH / 2) * progress * 0.04)
    pan_y = int((focus[1] - HEIGHT / 2) * progress * 0.04)
    center_x = max(crop_width // 2, min(WIDTH - crop_width // 2, WIDTH // 2 + pan_x))
    center_y = max(crop_height // 2, min(HEIGHT - crop_height // 2, HEIGHT // 2 + pan_y))
    x0, y0 = center_x - crop_width // 2, center_y - crop_height // 2
    image = cv2.resize(source[y0:y0 + crop_height, x0:x0 + crop_width], (WIDTH, HEIGHT))
    return image


def render_frame(background, scene, progress, caption, index, fonts):
    title_font, subtitle_font, caption_font, meta_font = fonts
    frame = camera_frame(background, progress, scene["focus"])
    image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert("RGBA")
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    draw.rounded_rectangle((866, 18, 1253, 57), radius=9, fill=(5, 23, 31, 220), outline=(56, 205, 166, 220), width=1)
    draw.ellipse((883, 32, 894, 43), fill=(*MINT, 255))
    draw.text((904, 27), "CURRENT PROTOTYPE SCREEN", font=meta_font, fill=(235, 248, 247, 255))

    focus_x, focus_y = scene["focus"]
    pulse = 1 + .18 * math.sin(progress * math.tau * 2)
    radius = int(20 * pulse)
    draw.ellipse((focus_x - radius, focus_y - radius, focus_x + radius, focus_y + radius), outline=(*MINT, 210), width=3)
    draw.ellipse((focus_x - 4, focus_y - 4, focus_x + 4, focus_y + 4), fill=(*MINT, 245))

    draw.rectangle((0, 525, WIDTH, HEIGHT), fill=(4, 17, 25, 222))
    draw.rectangle((0, 525, 10, HEIGHT), fill=(*MINT, 255))
    draw.text((48, 544), f"CHAPTER {index + 1:02}  /  AEROTWIN LIVE PROTOTYPE", font=meta_font, fill=(*MINT, 255))
    draw.text((48, 568), scene["title"], font=title_font, fill=(247, 251, 250, 255))
    draw.text((50, 612), scene["subtitle"], font=subtitle_font, fill=(181, 207, 208, 255))

    draw.rounded_rectangle((48, 651, 1232, 706), radius=9, fill=(2, 10, 15, 235), outline=(69, 111, 116, 210), width=1)
    lines = wrap_text(draw, caption, caption_font, 1120)[:2]
    first_y = 651 + max(6, (55 - len(lines) * 22) // 2)
    for line in lines:
        box = draw.textbbox((0, 0), line, font=caption_font)
        draw.text(((WIDTH - (box[2] - box[0])) // 2, first_y), line, font=caption_font, fill=(250, 252, 251, 255))
        first_y += 22

    draw.rectangle((0, 716, WIDTH, 720), fill=(29, 59, 66, 255))
    draw.rectangle((0, 716, int(WIDTH * progress), 720), fill=(*MINT, 255))
    image.alpha_composite(overlay)
    return cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR)


def main():
    if not WORK.exists():
        raise FileNotFoundError(f"Capture and narration folder is missing: {WORK}")

    fonts = (
        load_font("seguisb.ttf", 28),
        load_font("segoeui.ttf", 19),
        load_font("segoeui.ttf", 20),
        load_font("seguisb.ttf", 14),
    )
    screenshots = [WORK / scene["image"] for scene in SCENES]
    audio_files = [WORK / f"scene-{index:02}.wav" for index in range(1, len(SCENES) + 1)]
    for path in screenshots + audio_files:
        if not path.is_file():
            raise FileNotFoundError(f"Required walkthrough source is missing: {path}")

    durations = [audio_duration(path) for path in audio_files]
    sources = []
    for path in screenshots:
        image = cv2.imread(str(path))
        if image is None or image.shape[:2] != (HEIGHT, WIDTH):
            raise ValueError(f"Expected a {WIDTH}x{HEIGHT} browser capture: {path}")
        sources.append(image)

    narration_path = WORK / "narration.wav"
    with wave.open(str(audio_files[0]), "rb") as first:
        params = first.getparams()
    with wave.open(str(narration_path), "wb") as narration:
        narration.setparams(params)
        for path in audio_files:
            with wave.open(str(path), "rb") as segment:
                if segment.getparams()[:3] != params[:3]:
                    raise ValueError(f"Narration audio formats differ: {path}")
                narration.writeframes(segment.readframes(segment.getnframes()))

    video_path = DEMO / "project-walkthrough.mp4"
    rendered_path = WORK / "project-walkthrough-encoded.mp4"
    silent_path = WORK / "live-prototype-video.mp4"
    writer = cv2.VideoWriter(str(silent_path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError("Could not initialize the walkthrough video writer")

    cues, elapsed = [], 0.0
    poster_path = DEMO / "project-walkthrough-poster.jpg"
    for index, (scene, source, duration) in enumerate(zip(SCENES, sources, durations)):
        local_cues = captions_for(scene["narration"], duration)
        cues.extend((elapsed + start, elapsed + end, text) for start, end, text in local_cues)
        frame_count = math.ceil(duration * FPS)
        for frame_index in range(frame_count):
            scene_time = frame_index / FPS
            progress = min(1.0, scene_time / max(duration, .1))
            caption = next((text for start, end, text in local_cues if start <= scene_time < end), local_cues[-1][2])
            frame = render_frame(source, scene, progress, caption, index, fonts)
            if index > 0 and frame_index < 8:
                previous = camera_frame(sources[index - 1], 1, SCENES[index - 1]["focus"])
                alpha = (frame_index + 1) / 8
                frame = cv2.addWeighted(previous, 1 - alpha, frame, alpha, 0)
            writer.write(frame)
            if index == 0 and frame_index == FPS:
                cv2.imwrite(str(poster_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 91])
        elapsed += duration
    writer.release()

    captions_path = DEMO / "project-walkthrough-en.vtt"
    with captions_path.open("w", encoding="utf-8", newline="\n") as captions:
        captions.write("WEBVTT\n\n")
        for start, end, text in cues:
            captions.write(f"{timestamp(start)} --> {timestamp(end)}\n{text}\n\n")

    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y",
        "-i", str(silent_path), "-i", str(narration_path),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest",
        "-metadata", "title=AeroTwin Live Prototype Walkthrough",
        "-metadata", "comment=Current browser prototype screens with Microsoft David narration",
        "-f", "mp4", str(rendered_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    rendered_path.replace(video_path)

    print(f"Rendered {len(SCENES)} actual prototype screens and {sum(durations):.1f}s of narration")
    print(f"Video: {video_path} ({video_path.stat().st_size} bytes)")
    print(f"Captions: {captions_path} ({captions_path.stat().st_size} bytes)")
    print(f"Poster: {poster_path} ({poster_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
