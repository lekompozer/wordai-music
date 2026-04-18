let sharedAudioEl = null;
function getSharedAudio() {
    if (!sharedAudioEl) {
        sharedAudioEl = new Audio();
        sharedAudioEl.volume = 1;
        // set attributes if needed
    }
    return sharedAudioEl;
}
