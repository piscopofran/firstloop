#!/bin/bash
# build-sounds.sh: fetches the sample libraries that tools/build-sounds.py reads, at the commits the
# shipped sounds/ folder was built from. Maintainer tool; nothing here runs in the app.
#
#   FL_SOUNDS_SRC=/some/big/disk/src bash tools/build-sounds.sh
#
# Each repository is cloned without file contents (--filter=blob:none --no-checkout) and only the
# folders that are used are checked out, about 6 GB in all instead of far more.
# Licences: see sounds/CREDITS.md. Every source is CC0 1.0 except the two CC BY 3.0 ones named there.
set -e
SRC=${FL_SOUNDS_SRC:-$(cd "$(dirname "$0")/../.." && pwd)/.sounds-src}
mkdir -p "$SRC"

get() {   # get <folder> <owner/repo> <commit> <pathspec...>
  local name=$1 d="$SRC/$1" repo=$2 rev=$3; shift 3
  if [ ! -d "$d/.git" ]; then
    git clone -q --filter=blob:none --no-checkout "https://github.com/$repo" "$d"
  fi
  git -C "$d" fetch -q origin "$rev" 2>/dev/null || true
  git -C "$d" checkout -q "$rev" -- "$@"
  echo "$name: $(du -sh "$d" | cut -f1)"
}

get meatbass sfzinstruments/karoryfer.meatbass ac9e859564bda286ab5ec672d00ff1aa2fef2895 \
    Samples/pizz LICENSE readme.txt
get sfzinstruments_karoryfer.black-and-blue-basses sfzinstruments/karoryfer.black-and-blue-basses 6e7d674cdb41be7a54dbccb15472401ad01099b9 \
    Samples/darkblack/reg Samples/babyblue/reg license
get sfzinstruments_karoryfer.emilyguitar sfzinstruments/karoryfer.emilyguitar b4920dc662fd9cad6dcaccdeecffdd91c8725d8c \
    notes LICENSE readme.txt
get sfzinstruments_karoryfer-bigcat.cello sfzinstruments/karoryfer-bigcat.cello 6fd75fbfc1dbb3109bf26220ba1adea46188a18b \
    Samples/sus Samples/pizzcato LICENSE readme.txt
get sfzinstruments_SalamanderGrandPiano sfzinstruments/SalamanderGrandPiano 3382bf9496bba2486f5ab0de55a264d1dfc38404 \
    ':(glob)Samples/*v8.flac' ':(glob)Samples/*v12.flac' LICENSE README.md
get sfzinstruments_GregSullivan.E-Pianos sfzinstruments/GregSullivan.E-Pianos 8c3e581acda3594b553948ff0222d4f84a698376 \
    'Wurlitzer EP200' LICENSE README.md
get sfzinstruments_Discord-SFZ-GM-Bank sfzinstruments/Discord-SFZ-GM-Bank 7a9c478fe331f94f246d33332f0adedb25bbbe27 \
    'Discord GM/Melodic/026-Acoustic Guitar (steel)' 'Discord GM/Melodic/026-Acoustic Guitar (steel).sfz' README.md
get sgossner_VSCO-2-CE sgossner/VSCO-2-CE 440300901dfe9275fd84e0b7763af1f8443ae62e \
    Brass/Trumpet/sus 'Brass/F Horn/sus' 'Keys/Upright Piano' 'Strings/Cello Section/susvib' 'Strings/Cello Section/pizzT' \
    Strings/Harp 'Strings/Solo Violin/Arco Vib' 'Strings/Solo Violin/Pizz' 'Strings/Viola Section/susvib' 'Strings/Viola Section/pizz' \
    'Strings/Violin Section/susVib' 'Strings/Violin Section/Pizz' Woodwinds/Clarinet/susLong Woodwinds/Flute/susvib LICENSE README.md
get sgossner_VCSL sgossner/VCSL c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e \
    'Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato' 'Aerophones/Edge-blown Aerophones/Pipe Organ' \
    'Idiophones/Struck Idiophones/Cajon' 'Idiophones/Struck Idiophones/Claps' 'Idiophones/Struck Idiophones/Tambourine 1' LICENSE README.md

# drum kits: only the microphone files of the hits that are used
V=()
for m in kickmic snaremic oh; do
  for a in kick/${m}_kick_snon snare/${m}_snare_center snare/${m}_snare_rimshot snare/${m}_snare_crossstick hh/${m}_hh_closed hh/${m}_hh_open \
           hh/${m}_hh_pedal htom/${m}_htom_center ltom/${m}_ltom_center ride/${m}_ride_ride ride/${m}_ride_bell crash/${m}_crash_crash; do
    V+=(":(glob)Samples/$m/${a}_*")
  done
done
for p in shaker tambourine conga bongoh bongol cabasa cowbell tumba; do V+=("Samples/perc/close/$p"); done
get sfzinstruments_virtuosity_drums sfzinstruments/virtuosity_drums 9f04cf9a734527edfbb0a4eee1f674e45bbf71bc "${V[@]}" LICENSE README.md
W=()
for p in marching_kick snare_main snare_edge hat_closed hat_open hat_foot tom_floor tom_mlow tom_mhi ride crash; do W+=("Samples/$p" "Samples/wet/$p"); done
get sfzinstruments_karoryfer.swirly-drums sfzinstruments/karoryfer.swirly-drums c40dafe0011cb2e54c0c220ff0fa308a11fc60f5 "${W[@]}" license
get sfzinstruments_karoryfer.big-rusty-drums sfzinstruments/karoryfer.big-rusty-drums f07ce00df34a46b6b08375be56fe116cf15782bc \
    Samples/kick_24/kick Samples/snare_14/center Samples/snare_14/sidestick Samples/snare_14/rimshot Samples/tom_14/center Samples/tom_15/center \
    Samples/tom_18/center Samples/hihat_14/cl Samples/hihat_14/open Samples/hihat_14/chik Samples/ride_22/rd Samples/ride_22/bl Samples/crash_17/cr LICENSE
echo "sources are in $SRC; now run: FL_SOUNDS_SRC=$SRC python3 tools/build-sounds.py"
