#!/usr/bin/env python3
"""
Facebook Messenger Archive Explorer & Indexer
Author: Antigravity & Pair Programming Partner
Usage:
    python viewer.py [path_to_facebook_export]
If no path is specified, it will look in the current folder, or open a folder selection dialog.
"""

import sys
import os
import re
import html
import json
import time
import shutil
import webbrowser
from pathlib import Path
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    """HTTP handler that prevents browser caching so updates appear immediately."""
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def prompt_folder():
    """Try GUI folder picker, fallback to console input."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        selected = filedialog.askdirectory(title="Select your unzipped Facebook Export folder")
        root.destroy()
        if selected:
            return Path(selected)
    except Exception:
        pass
    
    print("\n--- Facebook Messenger Archive Explorer ---")
    val = input("Please enter the path to your Facebook Export folder: ").strip().strip('"').strip("'")
    return Path(val) if val else None

def find_messages_dir(root_dir: Path):
    """Locate the messages directory inside the Facebook export."""
    candidates = [
        root_dir / "your_facebook_activity" / "messages",
        root_dir / "messages",
        root_dir
    ]
    for c in candidates:
        if (c / "inbox").exists() or any(c.glob("inbox*")):
            return c
    return None

def detect_owner(root_dir: Path):
    """Detect account owner name from start_here.html or messages."""
    start_here = root_dir / "start_here.html"
    if start_here.exists():
        try:
            txt = start_here.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r'class="_aoaa">\s*([^<]+?)\s+(?:tạo lúc|created at)', txt, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        except Exception:
            pass
    return "You"

def parse_date(time_str):
    m_vi = re.search(r'Tháng\s+(\d+)\s+(\d+),\s+(\d{4})\s+(\d+):(\d+)(?::(\d+))?\s*(ch|sa|sáng|chiều|tối)?', time_str, re.IGNORECASE)
    if m_vi:
        month, day, year, hour, minute, second, period = m_vi.groups()
        month, day, year = int(month), int(day), int(year)
        hour, minute = int(hour), int(minute)
        second = int(second) if second else 0
        if period:
            p = period.lower()
            if p in ['ch', 'chiều', 'tối'] and hour < 12: hour += 12
            elif p in ['sa', 'sáng'] and hour == 12: hour = 0
        try:
            dt = datetime(year, month, day, hour, minute, second)
            return dt.isoformat(), int(dt.timestamp())
        except Exception:
            pass
            
    return None, 0

def clean_body(body_html):
    reactions = []
    ul_match = re.search(r'<ul class="_a6-q">(.*?)</ul>', body_html, re.DOTALL)
    if ul_match:
        ul_content = ul_match.group(1)
        body_html = body_html[:ul_match.start()] + body_html[ul_match.end():]
        for li in re.findall(r'<li><span>(.*?)</span></li>', ul_content, re.DOTALL):
            time_sub = re.search(r'<span>\s*\((.*?)\)\s*</span>', li)
            r_time = time_sub.group(1) if time_sub else ""
            li_no_time = re.sub(r'<span>\s*\(.*?\)\s*</span>', '', li).strip()
            m_react = re.match(r'^(\S+)\s*(.*)$', li_no_time)
            if m_react:
                reactions.append({'emoji': m_react.group(1), 'user': m_react.group(2).strip(), 'time': r_time})
            else:
                reactions.append({'raw': li_no_time})

    photos = [src for src in re.findall(r'<img[^>]+src="([^">]*)"', body_html) if '/photos/' in src or '/gifs/' in src]
    stickers = [src for src in re.findall(r'<img[^>]+src="([^">]*stickers_used/[^">]+)"', body_html)]
    videos = [src for src in re.findall(r'<video[^>]+src="([^">]*videos/[^">]+)"', body_html)]
    audios = [src for src in re.findall(r'<audio[^>]+src="([^">]*audio/[^">]+)"', body_html)]
    files = [href for href in re.findall(r'<a[^>]+href="([^">]*files/[^">]+)"', body_html)]

    cleaned = re.sub(r'<video.*?</video>', '', body_html, flags=re.DOTALL)
    cleaned = re.sub(r'<audio.*?</audio>', '', cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'<img[^>]*>', '', cleaned)
    cleaned = re.sub(r'<a target="_blank"[^>]*files/.*?</a>', '', cleaned)
    cleaned = re.sub(r'<a target="_blank"[^>]*photos/.*?</a>', '', cleaned)

    links = []
    for m in re.finditer(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', cleaned, re.DOTALL):
        href = m.group(1)
        if not any(x in href for x in ['photos/', 'videos/', 'audio/', 'files/', 'stickers_used/']):
            links.append({'url': href, 'text': m.group(2).strip()})

    text = re.sub(r'<[^>]+>', '\n', cleaned)
    text = html.unescape(text)
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    final_lines = [l for l in lines if l not in ["Nhấp để xem video:", "Nhấp để nghe âm thanh"]]
    text_content = "\n".join(final_lines)

    res = {}
    if text_content: res['text'] = text_content
    if photos: res['photos'] = photos
    if videos: res['videos'] = videos
    if audios: res['audios'] = audios
    if files: res['files'] = files
    if stickers: res['stickers'] = stickers
    if reactions: res['reactions'] = reactions
    if links: res['links'] = links
    return res

section_pattern = re.compile(
    r'<section class="_a6-g"[^>]*>\s*'
    r'<h2 class="_2ph_ _a6-h _a6-i"[^>]*>(.*?)</h2>\s*'
    r'<div class="_2ph_ _a6-p">(.*?)</div>\s*'
    r'<footer class="_3-94 _a6-o">\s*<div class="_a72d">(.*?)</div>\s*</footer>\s*'
    r'</section>',
    re.DOTALL
)

def build_data(root_dir: Path, messages_dir: Path, owner_name: str):
    data_dir = root_dir / "data"
    chats_dir = data_dir / "chats"
    chats_dir.mkdir(parents=True, exist_ok=True)

    categories = ["inbox", "archived_threads", "message_requests", "e2ee_cutover", "e2ee_cutover_archived"]
    all_convs = []

    total_msg = 0
    total_photos = 0
    total_videos = 0
    total_audios = 0
    total_files = 0

    print("\nScanning and indexing conversations...")
    t0 = time.time()

    for cat in categories:
        cat_dir = messages_dir / cat
        if not cat_dir.exists(): continue
        for conv_dir in cat_dir.iterdir():
            if not conv_dir.is_dir(): continue
            html_files = list(conv_dir.glob("message_*.html"))
            if not html_files: continue

            def sort_key(p):
                m = re.search(r'message_(\d+)\.html', p.name)
                return int(m.group(1)) if m else 1
            html_files.sort(key=sort_key, reverse=True)

            m1_file = conv_dir / "message_1.html"
            with open(m1_file, 'r', encoding='utf-8', errors='ignore') as f:
                header = f.read(50000)
            m_title = re.search(r'<title>(.*?)</title>', header)
            raw_title = m_title.group(1).strip() if m_title else conv_dir.name

            if raw_title.startswith("Người tham gia:") or raw_title.startswith("Participants:"):
                prefix = "Người tham gia:" if "Người tham gia:" in raw_title else "Participants:"
                parts = raw_title.replace(prefix, "").strip()
                names = [n.strip() for n in re.split(r'\s+(?:và|and)\s+', parts) if n.strip() != owner_name]
                conv_title = ", ".join(names) if names else raw_title
            else:
                conv_title = raw_title

            conv_messages = []
            participants = set()

            for h_file in html_files:
                content = h_file.read_text(encoding="utf-8", errors="ignore")
                clean = re.sub(r'<section class="_a6-g"[^>]*>\s*<h2[^>]*>Hiệu ứng từ ngữ</h2>.*?</section>\s*</div>\s*</section>', '', content, flags=re.DOTALL)
                matches = section_pattern.findall(clean)
                for sender, body, time_str in reversed(matches):
                    sender = sender.strip()
                    participants.add(sender)
                    iso_time, ts = parse_date(time_str)
                    is_me = (sender == owner_name)
                    parsed = clean_body(body)

                    msg_obj = {
                        'id': len(conv_messages) + 1,
                        's': sender,
                        'is_me': 1 if is_me else 0,
                        't': time_str,
                        'ts': ts,
                        'iso': iso_time
                    }
                    msg_obj.update(parsed)
                    conv_messages.append(msg_obj)

            if not conv_messages: continue

            total_msg += len(conv_messages)
            last_msg = conv_messages[-1]
            first_msg = conv_messages[0]

            p_cnt = sum(len(m.get('photos', [])) for m in conv_messages)
            v_cnt = sum(len(m.get('videos', [])) for m in conv_messages)
            a_cnt = sum(len(m.get('audios', [])) for m in conv_messages)
            f_cnt = sum(len(m.get('files', [])) for m in conv_messages)

            total_photos += p_cnt
            total_videos += v_cnt
            total_audios += a_cnt
            total_files += f_cnt

            preview = last_msg.get('text', '')
            if not preview:
                if last_msg.get('photos'): preview = "[Photo]"
                elif last_msg.get('videos'): preview = "[Video]"
                elif last_msg.get('audios'): preview = "[Voice message]"
                elif last_msg.get('files'): preview = "[File]"
                else: preview = "[Message]"

            conv_id = f"{cat}_{conv_dir.name}"
            summary = {
                'id': conv_id,
                'title': conv_title,
                'category': cat,
                'folder': conv_dir.name,
                'total_messages': len(conv_messages),
                'last_message': preview[:120],
                'last_sender': last_msg['s'],
                'last_time': last_msg['t'],
                'last_ts': last_msg['ts'],
                'first_time': first_msg['t'],
                'participants': list(participants),
                'photos_count': p_cnt,
                'videos_count': v_cnt,
                'audios_count': a_cnt,
                'files_count': f_cnt
            }
            all_convs.append(summary)

            chat_payload = {
                'id': conv_id,
                'title': conv_title,
                'category': cat,
                'folder': conv_dir.name,
                'participants': list(participants),
                'stats': {
                    'total': len(conv_messages),
                    'photos': p_cnt,
                    'videos': v_cnt,
                    'audios': a_cnt,
                    'files': f_cnt,
                    'start_time': first_msg['t'],
                    'end_time': last_msg['t']
                },
                'messages': conv_messages
            }

            chat_file = chats_dir / f"{conv_id}.js"
            chat_file.write_text(
                f'window.MESSENGER_CHATS = window.MESSENGER_CHATS || {{}};\n'
                f'window.MESSENGER_CHATS["{conv_id}"] = {json.dumps(chat_payload, ensure_ascii=False)};',
                encoding="utf-8"
            )

    all_convs.sort(key=lambda x: x['last_ts'], reverse=True)

    index_payload = {
        'user': owner_name,
        'stats': {
            'total_conversations': len(all_convs),
            'total_messages': total_msg,
            'total_photos': total_photos,
            'total_videos': total_videos,
            'total_audios': total_audios,
            'total_files': total_files
        },
        'categories': {
            'inbox': sum(1 for c in all_convs if c['category'] == 'inbox'),
            'e2ee': sum(1 for c in all_convs if 'e2ee' in c['category']),
            'archived': sum(1 for c in all_convs if c['category'] == 'archived_threads'),
            'requests': sum(1 for c in all_convs if c['category'] == 'message_requests')
        },
        'conversations': all_convs
    }

    index_file = data_dir / "index.js"
    index_file.write_text(
        f"window.MESSENGER_INDEX = {json.dumps(index_payload, ensure_ascii=False)};",
        encoding="utf-8"
    )

    print(f"Indexing completed in {time.time()-t0:.2f}s!")
    print(f"Total Conversations: {len(all_convs)}")
    print(f"Total Messages: {total_msg:,}")
    return index_payload

def copy_ui_assets(source_tool_dir: Path, target_root_dir: Path):
    if source_tool_dir.resolve() != target_root_dir.resolve():
        for asset in ["index.html", "style.css", "app.js"]:
            src = source_tool_dir / asset
            dst = target_root_dir / asset
            if src.exists():
                shutil.copy2(src, dst)

def start_server(web_dir: Path, preferred_port: int = 8080):
    os.chdir(web_dir)
    server = None
    selected_port = preferred_port

    for p in [preferred_port, 8000, 8081, 8888, 9000]:
        try:
            server = ThreadingHTTPServer(('127.0.0.1', p), NoCacheHTTPRequestHandler)
            selected_port = p
            break
        except OSError:
            continue

    if not server:
        print("Could not bind HTTP server. Opening index.html directly...")
        webbrowser.open(str(web_dir / "index.html"))
        return

    url = f"http://localhost:{selected_port}/index.html"
    print(f"\n=======================================================")
    print(f"  MESSENGER ARCHIVE EXPLORER IS RUNNING!")
    print(f"  Open in browser: {url}")
    print(f"  Press Ctrl+C in this window to stop the server.")
    print(f"=======================================================\n")
    
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()

def main():
    tool_dir = Path(__file__).resolve().parent
    
    build_only = "--build-only" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--build-only"]
    target_dir = None
    if len(args) > 0:
        target_dir = Path(args[0]).resolve()
    else:
        if find_messages_dir(Path.cwd()):
            target_dir = Path.cwd()
        elif find_messages_dir(tool_dir):
            target_dir = tool_dir
        else:
            target_dir = prompt_folder()

    if not target_dir or not target_dir.exists():
        print("Error: No valid Facebook folder specified.")
        sys.exit(1)

    messages_dir = find_messages_dir(target_dir)
    if not messages_dir:
        print(f"Error: Could not find 'messages' folder inside: {target_dir}")
        sys.exit(1)

    print(f"Found Facebook Export at: {target_dir}")
    owner = detect_owner(target_dir)
    print(f"Account Owner detected: {owner}")

    build_data(target_dir, messages_dir, owner)
    copy_ui_assets(tool_dir, target_dir)
    if build_only:
        print("\nBuild complete. Exiting (--build-only).")
        return
    start_server(target_dir)

if __name__ == "__main__":
    main()
