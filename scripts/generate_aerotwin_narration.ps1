$ErrorActionPreference = 'Stop'
$work = Join-Path $PSScriptRoot '..\frontend\public\demo\walkthrough-work'
New-Item -ItemType Directory -Force -Path $work | Out-Null

$narration = @(
  'Welcome to AeroTwin: an interactive digital-twin prototype for monitoring a synthetic aero piston engine. This short walkthrough explains the two concept clips, then shows what the working prototype actually does.',
  'The first supplied clip depicts an aircraft emergency scenario. The second shows a flight-monitoring and safe-landing concept. Both are illustrative visuals only. They are not recordings of AeroTwin, real UAV footage from this application, or evidence that crash detection or emergency dispatch is connected.',
  'In the prototype, a simulator generates changing engine telemetry: RPM, temperatures, oil and fuel pressures, fuel flow, vibration, and operating conditions. The digital twin updates from that stream, and the dashboard visualizes the same selected engine state as it changes.',
  'For early warning, an Isolation Forest looks for unusual sensor patterns, while a Random Forest classifies simulated fault types. The interface shows the predicted class, confidence, and contributing signals. Both models were trained on generated synthetic data, not validated real-engine recordings.',
  'Component health and the remaining-life indicator are simulated estimates. Mission reliability combines twin health and simulated mission phases to make the impact of a fault easier to understand. These numbers are demonstrations, not certified airworthiness or service-life decisions.',
  'The fleet view lets you select among independent virtual engines. The virtual UAV page visualizes a route linked to the selected engine. You can pause, resume, and inject demonstration faults. These controls affect software simulation only; they do not pilot a real aircraft.',
  'The assistant receives the latest twin snapshot with each question. On the public static site, it uses browser-side evidence routing; a backend can optionally call a configured language model. The Data Lab checks uploaded CSV signals for configured limit breaches and persistent trends. Prototype thresholds are not validated operating limits.',
  'The dashboard SOS drill only previews a simulated incident brief. It does not detect a real crash, locate responders, or send an alert. In summary, AeroTwin demonstrates a connected monitoring workflow: telemetry, twin, anomaly evidence, fault classification, health, mission context, and operator-facing explanations, all inside a safe synthetic prototype.'
)

Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = -1
$voice.Volume = 100
$availableVoices = @($voice.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
if ($availableVoices -contains 'Microsoft Zira Desktop') {
  $voice.SelectVoice('Microsoft Zira Desktop')
}

try {
  for ($index = 0; $index -lt $narration.Count; $index++) {
    $path = Join-Path $work ('scene-{0:D2}.wav' -f ($index + 1))
    $voice.SetOutputToWaveFile($path)
    $voice.Speak($narration[$index])
    $voice.SetOutputToNull()
  }
}
finally {
  $voice.Dispose()
}

Write-Output "Generated $($narration.Count) narration tracks in $work"
