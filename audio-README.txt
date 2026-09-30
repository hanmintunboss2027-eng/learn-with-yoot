Learn with Yoot — အသံ ဖတ်ပြ (narration) — ဘယ်လို ထည့်ရမလဲ
==================================================================
1. learn-with-yoot-audio-script.xlsx ထဲက စာကြောင်း တစ်ကြောင်းချင်းကို အသံသွင်းပါ (MP3, mono, 44.1 kHz)။
   Priority 1 (120 ခု) ကို အရင်၊ ပြီးမှ Priority 2 (513 ခု)၊ Priority 3 (257 ခု)။
2. ဖိုင်နာမည်ကို "File name (Burmese)" ထဲက အတိုင်း အတိအကျ ပေးပါ — ဥပမာ intro-ai-1.mp3၊ act-robot-7-1.mp3။
3. ဖိုင်အားလုံးကို index.html ဘေးက audio/ folder ထဲ ထည့်ပါ:
   - Online site: GitHub repo ထဲ audio/ folder ဖန်တီးပြီး ဖိုင်တွေ upload လုပ်ပါ (Add file → Upload files)။ Vercel က အလိုအလျောက် deploy လုပ်ပါမယ်။
   - USB / offline (dist): dist/ folder ထဲ audio/ folder ထည့်ပြီး index.html နဲ့ အတူ ကူးပါ။
4. App ထဲမှာ ဖိုင် ရှိတဲ့ နေရာတိုင်း 🔊 ခလုတ် အလိုအလျောက် ပေါ်ပါမယ်။ လေ့ကျင့်ခန်း ဖွင့်တိုင်း ညွှန်ကြားချက်ကို အလိုအလျောက် ဖတ်ပြပါမယ်
   (Profile စာမျက်နှာ → "အသံ ဖတ်ပြ" ခလုတ်နဲ့ ပိတ်/ဖွင့် လို့ရတယ်)။ ဖိုင် အသစ် တင်ပြီး ၁၀ မိနစ်အတွင်း (ဒါမှမဟုတ် page ပြန်ဖွင့်ရင်) ပေါ်ပါမယ်။
5. အင်္ဂလိပ် အသံ (မဖြစ်မနေ မဟုတ်): <id>.en.mp3 — မရှိရင် browser ရဲ့ English voice ကို သုံးပါမယ်။
6. မြန်ဆန်တဲ့ နည်း: tools/tts_azure.py — Azure Speech key နဲ့ ဒီ sheet ထဲက စာကြောင်းအားလုံးကို မြန်မာ AI အသံ (my-MM-NilarNeural / ThihaNeural) နဲ့ မိနစ်ပိုင်းအတွင်း ထုတ်ပေးပါတယ်:
   python3 tools/tts_azure.py guide/out/learn-with-yoot-audio-script.csv web/audio   (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION env လိုတယ်)
