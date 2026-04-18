import re
with open('/Users/user/Code/wordai-music/src/components/MusicSidebar.tsx', 'r') as f:
    content = f.read()

content = content.replace("onPlayTracks: (tracks: SidebarTrack[], playlistId?: string, playlistName?: string) => void;", "onPlayTracks: (tracks: SidebarTrack[], startIndex?: number, playlistId?: string, playlistName?: string) => void;")
content = content.replace("onPlayTracks: (tracks: SidebarTrack[]) => void;", "onPlayTracks: (tracks: SidebarTrack[], startIndex?: number) => void;")
content = content.replace("onClick={() => onPlayTracks(tracks)}", "onClick={() => onPlayTracks(tracks, 0)}")
content = content.replace("onClick={() => onPlayTracks(tracks.slice(i))}", "onClick={() => onPlayTracks(tracks, i)}")
content = content.replace("onPlayTracks([track]);", "onPlayTracks([track], 0);")
content = content.replace("onPlayTracks([{ ...track, source: 'youtube' }]);", "onPlayTracks([{ ...track, source: 'youtube' }], 0);")
content = content.replace("onPlayTracks([{ ...track }]);", "onPlayTracks([{ ...track }], 0);")
content = content.replace("onPlayTracks={tracks => onPlayTracks(tracks, pub.id, pub.name)}", "onPlayTracks={(tracks, startIdx) => onPlayTracks(tracks, startIdx, pub.id, pub.name)}")
content = content.replace("onPlayTracks(pl.tracks, pl.id, pl.name);", "onPlayTracks(pl.tracks, 0, pl.id, pl.name);")
content = content.replace("onPlayTracks(pl.tracks.slice(origIdx), pl.id, pl.name);", "onPlayTracks(pl.tracks, origIdx, pl.id, pl.name);")

with open('/Users/user/Code/wordai-music/src/components/MusicSidebar.tsx', 'w') as f:
    f.write(content)
print("done replacing")
