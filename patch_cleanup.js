const fs = require('fs');

let code = fs.readFileSync('/Users/user/Code/wordai-music/src/components/MusicPlayerClient.tsx', 'utf8');

// 1. Remove pause and src='' from the slide effect cleanup
code = code.replace(/if \(audioRef\.current\) \{\s*audioRef\.current\.pause\(\);\s*audioRef\.current\.src = '';\s*\}/g, ``);

// 2. Add teardown to the init effect
const initEffect = `
    const currentBlobUrlRef = useRef<string | null>(null);
    const hasInitAudioRef = useRef(false);

    useEffect(() => {
        if (!hasInitAudioRef.current) {
            const a = new Audio();
            a.preload = 'auto';
            audioRef.current = a;
            setAudioEl(a);
            hasInitAudioRef.current = true;
        }
    }, []);
`;
const newInitEffect = `
    const currentBlobUrlRef = useRef<string | null>(null);
    const hasInitAudioRef = useRef(false);

    useEffect(() => {
        if (!hasInitAudioRef.current) {
            const a = new Audio();
            a.preload = 'auto';
            audioRef.current = a;
            setAudioEl(a);
            hasInitAudioRef.current = true;
        }
        return () => {
            const a = audioRef.current;
            if (a) {
                a.pause();
                a.src = '';
            }
        };
    }, []);
`;
code = code.replace(initEffect, newInitEffect);

fs.writeFileSync('/Users/user/Code/wordai-music/src/components/MusicPlayerClient.tsx', code);
console.log("Patched cleanup");
