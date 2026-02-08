# LAN Video Server

LAN üzerinden belirtilen klasördeki videolara tarayıcıdan erişip oynatmak için Node.js sunucusu. Giriş, favoriler, son izlenenler ve süre kaydı destekler.

**Sürüm:** 1.0.0

---

## İlk çalıştırmadan önce eklemeniz gerekenler

| Öğe | İşlem |
|-----|--------|
| **`.env`** | **Zorunlu.** `.env.example` dosyasından kopyalayın: `copy .env.example .env` (Windows) veya `cp .env.example .env` (Linux/macOS). `LOGIN_USERNAME` ve `LOGIN_PASSWORD` ayarlayın. İsteğe bağlı: oturum güvenliği için `SESSION_SECRET`. Windows’ta sistem `USERNAME` ile karışmaması için `LOGIN_USERNAME` / `LOGIN_PASSWORD` kullanın. |
| **`config.json`** | **Zorunlu.** Video kök klasörlerini tanımlayın. Repoda örnek var. Kendi yollarınızı ekleyin, örn. `{ "videoDirs": [ { "name": "Videolar", "path": "docs" }, { "name": "Filmler", "path": "D:/filmler" } ] }`. `name` = arayüzde görünen ad; `path` = projeye göre göreli veya tam yol. Klasörler yoksa oluşturun. |
| **Video klasörleri** | Video dosyalarınızın (örn. `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`) bulunduğu klasörleri oluşturun veya yolu `config.json`’da belirtin. |

`.remember-tokens.json` veya `.user-data.json` oluşturmanız gerekmez; sunucu çalışırken oluşturur.

---

## Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Ortam dosyasını oluştur

Proje kökünde **`.env`** dosyası oluşturup giriş bilgilerini yazın (zorunlu):

```env
LOGIN_USERNAME=admin
LOGIN_PASSWORD=your_password_here
```

Windows'ta sistem `USERNAME` değişkeniyle karışmaması için `LOGIN_USERNAME` / `LOGIN_PASSWORD` kullanın. İsteğe bağlı: `SESSION_SECRET` (oturum güvenliği). Örnek şablon: `.env.example`

### 3. Video klasörlerini tanımla

**`config.json`** içinde video kök dizinlerini verin:

```json
{
  "videoDirs": [
    { "name": "Videolar", "path": "docs" },
    { "name": "Filmler", "path": "D:/filmler" }
  ]
}
```

- **name:** Arayüzde görünen klasör adı
- **path:** Projeye göre göreli yol (`docs`) veya tam yol (`D:/filmler`). Sunucu ilk çalıştırmada yoksa klasörü oluşturur; alt klasörler desteklenir.

Desteklenen video formatları: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`

---

## Çalıştırma

| Yöntem | Komut / Dosya |
|--------|----------------|
| Terminal | `npm start` veya `node server.js` |
| Windows (IP + QR) | `start.bat` |
| Exe (Windows) | `npm run build` → `dist/video-server.exe` |

Sunucu **http://0.0.0.0:3366** üzerinde dinler.

- **Bilgisayar:** Tarayıcıda `http://BILGISAYAR_IP:3366`
- **Telefon:** Aynı adres veya bat ile gösterilen QR kodu okutun

Exe kullanıyorsanız exe ile **aynı klasörde** `config.json` ve `.env` bulunmalı; video yolları exe'nin dizinine göre veya tam yol olarak verilebilir.

---

## Kullanım (Arayüz)

### Giriş

- Sayfa açıldığında giriş ekranı gelir; `.env` içindeki kullanıcı adı ve şifre ile giriş yapın.
- **Beni hatırla** işaretlenirse tarayıcı kapatılsa bile oturum devam eder (sunucuda token saklanır).

### Ana sayfa

- **Favoriler:** En üstte "Favoriler" klasörü. Videoya yıldız (☆/⭐) ile ekleyip çıkarabilirsiniz. Favoriler sunucuda kullanıcıya göre saklanır; sunucu yeniden başlasa da gelir.
- **Son izlenenler:** "Son izlenenler" klasöründe son 10 izleme listelenir; tıklayınca açılır/kapanır. Sunucuda kullanıcıya göre saklanır.
- **Klasörler:** Alt klasörlere tıklayarak ilerleyin; videoları listeden seçip oynatın.

### Oynatıcı kontrolleri

- **−30 / −10 / −5** ve **+5 / +10 / +30:** Saniye atlama
- **▶/⏸:** Oynat / Duraklat | **⏹:** Videoyu kapat
- **Süre çubuğu:** Üzerinde basılı tutup kaydırırken süre tooltip'te görünür; bırakınca o noktadan devam eder
- **▼ (slider yanı):** Ses ve ses çubuğu satırını açar/kapatır

### Ayarlar (⚙️, arama çubuğunun sağında)

- **Süre atlama:** "Git" ile belirli saniye/dakika/saat'e gitme (örn. `1:30`, `90`)
- **Altyazı:** Videoyla aynı isimli `.vtt` / `.srt` dosyaları listeden seçilebilir
- **Bitiş davranışı (🔁):** Hiçbir şey / Tekrar oynat / Sonrakine geç
- **Son izlenenleri temizle (🗑):** Son izlenenler listesini siler
- **Çıkış (🚪):** Oturumu kapatır

### Favoriler ve kaldığın yerden devam

- Favoriye eklenen videoların izleme süresi sunucuda saklanır; favoriden tekrar açınca aynı saniyeden devam eder.
- Son izlenenler de sunucuda kullanıcıya göre tutulur; sunucu yeniden başlasa da liste geri gelir.

---

## Sunucuda Saklanan Veriler

Aşağıdaki dosyalar sunucu çalışırken oluşur; `.gitignore` ile repoya alınmaz:

| Dosya | Açıklama |
|-------|----------|
| `.remember-tokens.json` | "Beni hatırla" oturum token'ları |
| `.user-data.json` | Kullanıcıya göre favoriler ve son izlenenler (sunucu yeniden başlasa da kalır) |

---

## Özellikler özeti

- Giriş sayfası (kullanıcı adı / şifre)
- Klasör ağacı ve video listesi (çoklu kök dizin)
- Range destekli streaming (atlama / seek)
- Favoriler (sunucuda kullanıcıya göre, kalıcı)
- Son izlenenler (son 10, sunucuda kullanıcıya göre, kalıcı)
- Favorilerde kaldığın yerden devam (süre kaydı)
- Altyazı seçimi (.vtt / .srt)
- PWA: ana ekrana eklenebilir
- Dokunmatik kısa kaydırma ile ±10 saniye seek
- Süre slider'ında basılı tutarken süre tooltip'i
