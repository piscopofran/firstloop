#!/bin/bash
# the phone journey on every device and theme, then touch editing; a line each in out/PHALL
cd "$(dirname "$0")"; : > out/PHALL
for a in "ip13" "ip13 light" "se" "px7" "px7 light" "ip13l" "ipad" "ipad light"; do
  bash rt.sh t_phone.js $a >> out/PHALL 2>&1
done
for a in ip13 se px7; do bash rt.sh t_touch.js $a >> out/PHALL 2>&1; done
bash rt.sh t_mobile.js >> out/PHALL 2>&1
bash rt.sh t_sizes.js >> out/PHALL 2>&1
echo done >> out/PHALL
