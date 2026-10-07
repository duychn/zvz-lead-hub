// Single-page demo served at "/". It calls the preview endpoint, which never stores or forwards data.

export const demoPage = () => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZvZ Lead Hub — Demo chấm điểm lead</title>
<meta name="description" content="Thử gửi một lead mẫu: ZvZ Lead Hub chuẩn hóa số điện thoại, chấm điểm và giải thích lý do.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap" rel="stylesheet">
<style>
:root{--blue:#0077c0;--ink:#1d242b;--muted:#475569;--line:#e2e8f0;--bg:#f6f9fc}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg)}
main{max-width:960px;margin:0 auto;padding:40px 20px 64px}
.logo{font-weight:800;font-size:26px;letter-spacing:-1.5px;text-decoration:none;color:var(--ink)}.logo b{color:var(--blue)}
h1{font-size:clamp(30px,5vw,44px);line-height:1.15;letter-spacing:-1.5px;margin:28px 0 12px}
p{color:var(--muted);margin:0 0 12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:28px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
input,textarea{width:100%;font:inherit;padding:11px 12px;border:1px solid var(--line);border-radius:10px}
input:focus,textarea:focus{outline:2px solid var(--blue);outline-offset:1px;border-color:transparent}
button{margin-top:18px;width:100%;font:inherit;font-weight:600;color:#fff;background:var(--blue);border:0;border-radius:10px;padding:13px;cursor:pointer}
button:disabled{opacity:.6;cursor:wait}
.tier{display:inline-block;font-weight:700;font-size:13px;letter-spacing:.6px;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.hot{background:#fde8e8;color:#b42318}.warm{background:#fff4dc;color:#946200}.review{background:#eef2f6;color:#475569}
.big{font-size:56px;font-weight:800;letter-spacing:-2px;line-height:1;margin:14px 0 6px}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px;margin:18px 0 0}dt{color:var(--muted)}dd{margin:0;word-break:break-word}
.note{font-size:13px}.error{color:#b42318}
footer{margin-top:32px;font-size:14px}a{color:var(--blue)}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<a class="logo" href="https://zvzdigital.com/"><b>ZvZ</b>Digital</a>
<h1>Thử chấm điểm một lead.</h1>
<p>Đây là bản prototype của ZvZ AI Hub. Nhập một lead mẫu: hệ thống chuẩn hóa số điện thoại, chấm điểm từ 0 đến 100 và giải thích lý do trong một câu.</p>
<div class="grid">
<form class="card" id="f">
<label for="name">Tên</label><input id="name" name="name" value="Nguyễn Minh Anh" maxlength="100">
<label for="phone">Số điện thoại</label><input id="phone" name="phone" value="090 123 4567" maxlength="25">
<label for="email">Email</label><input id="email" name="email" type="email" placeholder="ten@congty.com" maxlength="150">
<label for="company">Doanh nghiệp</label><input id="company" name="company" value="Nha khoa Minh An" maxlength="150">
<label for="message">Lời nhắn</label><textarea id="message" name="message" rows="3" maxlength="2000">Cho mình xin báo giá gói niềng răng, tuần này mình muốn đặt lịch.</textarea>
<button id="go">Chấm điểm lead</button>
<p class="note" style="margin-top:12px">Dữ liệu demo không được lưu và không gửi vào CRM. Khi bật chấm điểm bằng AI, lời nhắn được gửi tới Claude API để chấm.</p>
</form>
<section class="card" id="out" aria-live="polite"><p>Kết quả sẽ hiện ở đây.</p></section>
</div>
<footer><p>Mã nguồn: <a href="https://github.com/duychn/zvz-lead-hub">github.com/duychn/zvz-lead-hub</a> · Sản phẩm: <a href="https://zvzdigital.com/product.html">ZvZ AI Hub</a></p></footer>
</main>
<script>
const f=document.getElementById('f'),out=document.getElementById('out'),go=document.getElementById('go');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={hot:'Nóng',warm:'Ấm',review:'Cần kiểm tra'};
f.addEventListener('submit',async e=>{
  e.preventDefault();go.disabled=true;out.innerHTML='<p>Đang chấm điểm…</p>';
  try{
    const res=await fetch('/v1/leads/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});
    const d=await res.json();
    if(!res.ok)throw new Error(d.error||'Có lỗi xảy ra.');
    const s=d.score,l=d.lead;
    out.innerHTML='<span class="tier '+esc(s.tier)+'">'+esc(label[s.tier])+'</span><div class="big">'+esc(s.score)+'</div><p>'+esc(s.reason)+'</p>'
      +'<dl><dt>Số chuẩn hóa</dt><dd>'+esc(l.phone||'—')+'</dd><dt>Email</dt><dd>'+esc(l.email||'—')+'</dd><dt>Nguồn</dt><dd>'+esc(l.source)+'</dd><dt>Bộ chấm</dt><dd>'+(s.scorer==='claude'?'Claude API':'Quy tắc (chưa bật AI)')+'</dd></dl>';
  }catch(err){out.innerHTML='<p class="error">'+esc(err.message)+'</p>';}
  finally{go.disabled=false;}
});
</script>
</body></html>`;
