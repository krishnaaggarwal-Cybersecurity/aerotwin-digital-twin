$ErrorActionPreference = 'Stop'
$work = Join-Path $PSScriptRoot 'walkthrough-work'
New-Item -ItemType Directory -Force -Path $work | Out-Null

$narration = @(
  'Welcome to AeroTwin! This is the running prototype itself, captured screen by screen. I’ll show you what’s actually working—from changing engine readings, to the model evidence, to the operator tools. Let’s jump in.',
  'Start with Flightline Overview. The selected virtual engine is right here. RPM, cylinder temperature, oil pressure, and anomaly score are updating together. This is a working software simulation—not a mockup—but every reading is synthetic. No real engine or aircraft is connected.',
  'Open Telemetry. Here are the live sensor cards, and below them, the trends the twin sees. Temperature, pressure, vibration, and fuel signals are tracked together so you can follow what changes, and when.',
  'Now Fault Prediction. Random Forest classifies the simulated fault; Isolation Forest checks for unusual patterns. These are separate signals: the current screen shows a Normal class at 91.2 percent confidence and a zero anomaly score. Try a simulated fault and watch the evidence change. The models were trained on synthetic data, not real engine test records.',
  'This is the actual Digital Twin inspection view: a three-dimensional reference engine alongside the selected twin’s condition. You can rotate the model and inspect its mapped components. It is a visual reference, not a sensor-equipped, physically synchronized engine.',
  'Mission Reliability turns the current simulated condition into a phase-by-phase mission picture. Explore how the score and modeled risk respond to engine health. This is a transparent prototype indicator—not a certified probability of mission success.',
  'Fleet runs three isolated virtual engine twins. Select another one to change which engine feeds the main dashboard. Each is a separate software simulation, not a real aircraft connection.',
  'On Virtual UAV, watch the illustrative route and linked engine readings side by side. Route progress follows the software simulation, and the page explicitly says it is not a navigation map. Nothing here sends commands to a real aircraft.',
  'Now ask the assistant a question about the selected engine. The public demo answers from the latest synthetic twin snapshot, so the response changes with the evidence. This browser version does not connect to a hosted language model; an optional model is only configured on the backend.',
  'The Data Lab is where you can bring a CSV. It establishes a measured baseline, checks configured signal limits, and looks for persistent changes across consecutive samples. These are prototype screening rules—not validated engine limits.',
  'Finally, the SOS drill. It previews an incident brief for demonstration only. It does not detect a real crash, find a help center, or send an SOS. That is AeroTwin today: a connected, interactive software prototype for exploring the monitoring workflow—clearly synthetic, and not connected to a real aircraft.'
)

Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = 1
$voice.Volume = 100
$voice.SelectVoice('Microsoft David Desktop')

try {
  for ($index = 0; $index -lt $narration.Count; $index++) {
    $path = Join-Path $work ('scene-{0:D2}.wav' -f ($index + 1))
    $voice.SetOutputToWaveFile($path)
    $safeText = [System.Security.SecurityElement]::Escape($narration[$index])
    foreach ($term in @('AeroTwin', 'Flightline Overview', 'Fault Prediction', 'Digital Twin', 'Mission Reliability', 'Virtual UAV', 'Data Lab', 'SOS')) {
      $safeText = [regex]::Replace($safeText, [regex]::Escape($term), "<emphasis level='moderate'>$term</emphasis>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    $ssml = "<speak version='1.0' xml:lang='en-US'><voice name='Microsoft David Desktop'><prosody rate='+12%' pitch='+8%'>$safeText</prosody></voice></speak>"
    $voice.SpeakSsml($ssml)
    $voice.SetOutputToNull()
  }
}
finally {
  $voice.Dispose()
}

Write-Output "Generated $($narration.Count) upbeat Microsoft David narration tracks in $work"
