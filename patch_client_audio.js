const fs = require('fs');

let code = fs.readFileSync('/Users/user/Code/wordai-music/src/components/MusicPlayerClient.tsx', 'utf8');

// Replace everything from audio.ontimeupdate down to audio.crossOrigin = 'anonymous';
const badCode = `, () => { if (!cancelled) advanceToNext(); });
            // Only advance on ended if crossfade wasn't already triggered
            audio.addEventListener('ended', () => {
                if (!cancelled && !crossfadeTriggered) {
                    recordTrackPlay(track.id);
                    advanceToNext();
                }
            });
            audio.addEventListener('playing', () => setAutoplayBlocked(false));`;

code = code.replace(badCode, `// Cleaned up listeners`);

// we also need to fix `crossfadeTriggered` which was removed but is still here
code = code.replace(/&& !crossfadeTriggered/g, "");

fs.writeFileSync('/Users/user/Code/wordai-music/src/components/MusicPlayerClient.tsx', code);
console.log("Patched");
