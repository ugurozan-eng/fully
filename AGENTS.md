<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proje Geliştirme ve Dağıtım Kuralları

1. **Sürekli Dağıtım (Deploy & Push)**: Yapılan her kod geliştirme veya değişiklik sonrasında, güncel kodların Git ile push edilmesi (`git push origin main`) ve Vercel üzerinde canlıya deploy edilmesi kesin kuraldır.
2. **Dokümantasyon Güncelliği**: Her geliştirme sonrasında, yapılan değişiklikleri ve testleri özetleyen `docs/handoff.md` ile conversation bazlı `walkthrough.md` belgesi kesinlikle güncellenecektir.
