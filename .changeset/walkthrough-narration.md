---
"autovisualizer": minor
---

Walkthroughs can talk. `speak` reads each step's note with the browser's voice, `audio-src="audio/{step}.wav"` plays a recorded clip per step, and `element.narrate = async (step) => urlOrBlob` voices steps live from any speech model. Autoplay waits for each step's audio. `element.getSteps()` lists every step's text for recording clips ahead of time, and a `step` event fires on each step.
