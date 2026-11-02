#!/data/data/com.termux/files/usr/bin/bash
# OT国試トレーナー Android（Termux）用: 初回の準備と更新を兼ねる（更新は ot-update で同じものが動く）。
# - 展開済みのフォルダから実行されたら、そこから ~/ot へ入れる（初回の手順）
# - そうでなければ ダウンロード の最新の OT*.zip を展開して ~/ot へ入れる（更新）
# どちらも ~/ot/user（学習記録）は残す。起動は ot（Termux を開くと自動で起動）。
# 実行中に自分自身を置き換えるので、全体を関数にして読み終えてから動かす。
main() {
  set -e
  DEST="$HOME/ot"
  command -v python >/dev/null 2>&1 || { pkg update -y && pkg install -y python; }
  SELF="$(cd "$(dirname "$0")/../.." && pwd)"
  TMP="$HOME/.ot_new"
  if [ -d "$SELF/app" ] && [ -d "$SELF/content" ] && [ "$SELF" != "$DEST" ]; then
    SRC="$SELF"
  else
    if [ ! -d "$HOME/storage/downloads" ]; then
      echo "ストレージの許可を求めます。表示されたら「許可」を押してください。"
      termux-setup-storage
      for i in $(seq 1 30); do [ -d "$HOME/storage/downloads" ] && break; sleep 1; done
    fi
    ZIP="$(ls -t "$HOME"/storage/downloads/OT*.zip 2>/dev/null | head -n 1)"
    if [ -z "$ZIP" ]; then
      echo "ダウンロードに OT国試トレーナー.zip が見つかりません。ドライブからダウンロードしてから、もう一度実行してください。"
      exit 1
    fi
    echo "展開します: $ZIP"
    rm -rf "$TMP"
    python -m zipfile -e "$ZIP" "$TMP"
    SRC="$(dirname "$(ls -d "$TMP"/*/app | head -n 1)")"
  fi
  mkdir -p "$DEST/user"
  rm -rf "$DEST/app" "$DEST/content" "$DEST/tools"
  mv "$SRC/app" "$SRC/content" "$DEST/"
  cp -r "$SRC/tools" "$DEST/"  # このスクリプト自身が tools/ の中で動いていることがあるので移動でなくコピー
  rm -rf "$TMP"
  # 起動コマンド ot／更新コマンド ot-update
  install -m 755 "$DEST/tools/android/ot.sh" "$PREFIX/bin/ot"
  install -m 755 "$DEST/tools/android/setup.sh" "$PREFIX/bin/ot-update"
  # Termux を開いたら自動で起動
  grep -q "OT国試トレーナー自動起動" "$HOME/.bashrc" 2>/dev/null || echo 'ot  # OT国試トレーナー自動起動' >> "$HOME/.bashrc"
  # Termux:Widget を入れている場合のホーム画面ショートカット
  mkdir -p "$HOME/.shortcuts" && install -m 755 "$DEST/tools/android/ot.sh" "$HOME/.shortcuts/OT国試トレーナー"
  python -c "import json,sys;print('データの版:', json.load(open(sys.argv[1],encoding='utf-8')).get('version'))" "$DEST/content/manifest.json"
  echo "準備できました。これからは Termux を開くだけでアプリが開きます（手で開くときは ot、更新は ot-update）。"
  bash "$PREFIX/bin/ot"
}
main "$@"
exit
