function textToSpeech(text, volume=g_pref_ttsVolume) {
    // Create a new SpeechSynthesisUtterance object with the provided text
    const speech = new SpeechSynthesisUtterance(text);

    // Retrieve the list of available voices
    const voices = window.speechSynthesis.getVoices();

    // Use the variable g_pref_ttsVoice to select the voice
    const preferredVoiceName = g_pref_ttsVoice; // Replace this with your preferred voice variable
    const preferredVoice = voices.find(voice => voice.name === preferredVoiceName);

    if (preferredVoice) {
        speech.voice = preferredVoice; // Assign the preferred voice to the utterance
    }

    speech.rate = 1.2;    // Normal speed
    speech.pitch = 1;   // Normal pitch
    speech.volume = (volume / 100);  // Full volume

    // Speak the text out loud
    window.speechSynthesis.speak(speech);
}

function processTyreDeltaMessage(data) {
    let messageText = "";

    if (data['tyre-delta'] == 0) {
        messageText = __("frontendUpdate.tyreDeltaSame", {
            curr: data['curr-tyre-type'],
            other: data['other-tyre-type']
        });
    } else if (data['tyre-delta'] > 0) {
        messageText = __("frontendUpdate.tyreDeltaFaster", {
            curr: data['curr-tyre-type'],
            other: data['other-tyre-type'],
            delta: formatFloat(Math.abs(data['tyre-delta']))
        });
    } else {
        messageText = __("frontendUpdate.tyreDeltaSlower", {
            curr: data['curr-tyre-type'],
            other: data['other-tyre-type'],
            delta: formatFloat(Math.abs(data['tyre-delta']))
        });
    }

    console.log("received tyre delta update", data, "TTS text", messageText);
    textToSpeech(messageText);
}

function processCustomMarkerMessage(data) {
    console.log("processCustomMarkerMessage", data);
}

function processFinalClassificationNotification(data) {
    console.log("processFinalClassificationNotification", data);
    const playerPosition = data['player-position'];
    if (playerPosition && playerPosition >= 1 && playerPosition <= 3) {
        console.log("Podium finish! Player position:", playerPosition);
        const confettiDurationMs = 10000;
        shootConfetti(confettiDurationMs);
    }
}

function processTyreDeltaMessageV2(data, iconCache) {
    if (g_pref_tyreDeltaNotificationTtsFormat) {
        // Since its TTS format, reuse the old format code
        data["tyre-delta-messages"].forEach(message => processTyreDeltaMessage(message));
    } else {
        const tyreDeltaToast = new TyreDeltaToast(iconCache, g_pref_tyreDeltaNotificationOsdDurationSec * 1000);
        tyreDeltaToast.show(data);
    }
}
