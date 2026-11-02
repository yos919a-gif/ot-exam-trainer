#!/data/data/com.termux/files/usr/bin/bash
# OT国試トレーナー Android（Termux）用の起動: サーバーが止まっていれば裏で起動し、ブラウザで開く。
DIR="$HOME/ot"
PORT=8765
URL="http://localhost:$PORT/app/"
up() { python -c "import socket,sys;s=socket.socket();s.settimeout(0.3);sys.exit(0 if s.connect_ex(('127.0.0.1',$PORT))==0 else 1)"; }
if ! up; then
  if [ ! -f "$DIR/tools/serve.py" ]; then
    echo "アプリが見つかりません。ot-update で入れ直してください。"
    exit 1
  fi
  termux-wake-lock 2>/dev/null || true
  nohup python "$DIR/tools/serve.py" "$PORT" > "$DIR/server.log" 2>&1 &
  for i in $(seq 1 40); do up && break; sleep 0.25; done
fi
if up; then
  termux-open-url "$URL"
  echo "アプリを開きました。Termux は閉じずに裏に置いたままにしてください（止めるときは通知の Exit）。"
else
  echo "起動できませんでした（記録: $DIR/server.log）"
  tail -n 5 "$DIR/server.log"
fi
