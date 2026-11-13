# Spesifikasi Implementasi `/bots` --- EMA Pullback Scalping Backtester

> Dokumen implementasi untuk Claude Code. Tujuan: menambahkan halaman
> `/bots` pada web app yang sudah terhubung ke OKX dan memiliki data
> OHLCV/chart. Fokus versi pertama adalah strategi rule-based dan
> backtesting/simulasi; **jangan mengirim order live**.

## 1. Tujuan dan ruang lingkup

Bangun modul `/bots` agar pengguna dapat:

1.  Membuat dan mengonfigurasi bot strategi scalping.
2.  Memilih instrumen OKX, rentang tanggal, dan timeframe.
3.  Menjalankan backtest dari OHLCV historis yang tersedia melalui
    infrastruktur aplikasi saat ini.
4.  Mensimulasikan modal awal dengan default **US\$1,000**.
5.  Melihat metrik performa, equity curve, drawdown, dan daftar seluruh
    trade.
6.  Menyimpan konfigurasi strategi dan hasil backtest bila pola
    penyimpanan aplikasi mendukungnya.

Versi pertama adalah **backtest dan paper simulation saja**. Tidak boleh
ada pemanggilan endpoint untuk membuat, mengubah, atau membatalkan order
OKX. Jangan mengaktifkan live trading melalui tombol, konfigurasi
tersembunyi, atau fallback otomatis.

## 2. Instruksi awal untuk Claude Code

Sebelum mengubah kode:

-   Inspeksi repository, `README`, struktur routing, framework, pola UI,
    state management, API layer, database, chart library, dan cara
    aplikasi mengambil OHLCV dari OKX.
-   Temukan route/page chart yang sudah ada dan gunakan ulang komponen
    serta service yang relevan.
-   Identifikasi format OHLCV, timezone, aturan pagination, instrument
    ID, jenis instrumen (spot/swap), dan penanganan rate limit.
-   Ikuti konvensi proyek. Jangan mengganti stack, membuat koneksi OKX
    kedua, atau menambahkan dependency besar jika tidak diperlukan.
-   Jangan mengasumsikan nama file, framework, atau skema database. Buat
    implementasi sesuai struktur aktual.
-   Setelah inspeksi, berikan ringkasan singkat rencana file yang akan
    dibuat/diubah, lalu implementasikan.

## 3. Halaman dan UX `/bots`

Tambahkan route `/bots` dengan tampilan yang konsisten dengan aplikasi.

### Layout yang disarankan

**A. Header** - Judul: `Bots` - Deskripsi:
`Build, configure, and backtest trading strategies` - Status mode:
`Backtest / Paper simulation — no live orders`

**B. Strategy configuration panel** - Strategy:
`EMA Pullback Scalping` - Instrument: pilih dari instrumen yang didukung
integrasi OKX saat ini. - Market type: gunakan tipe yang sudah didukung
aplikasi (spot atau perpetual swap); tampilkan dengan jelas. - Entry
timeframe: default `5m`. - Trend timeframe: default `15m`. - Start date
dan end date. - Initial equity: default `1000 USD`. - Risk per trade:
default `1%`. - Risk:reward: default `3.0`. - Fee rate: gunakan nilai
aktual konfigurasi/market OKX bila tersedia; jika tidak, sediakan input
yang jelas dan jangan mengarang nilai. - Slippage: input basis points
atau persentase yang terdokumentasi; default dapat `0` untuk eksperimen,
tetapi tampilkan peringatan bahwa hasil tanpa slippage cenderung
optimistis. - Tombol `Run backtest`.

**C. Summary metrics** Tampilkan minimal: - Initial equity - Final
equity - Net PnL (USD dan %) - Number of trades - Win rate - Profit
factor - Average win dan average loss - Expectancy per trade (USD dan
R) - Maximum drawdown (USD dan %) - Average R multiple - Total fees -
Exposure / time in market jika mudah dihitung

**D. Charts** - Equity curve sepanjang waktu. - Drawdown curve. -
Distribusi hasil trade dalam R (opsional). - Jika chart candle yang
sudah ada mendukung marker, tampilkan entry, SL, dan TP pada chart;
jangan membangun chart engine baru bila bisa memakai komponen yang ada.

**E. Trade history** Tabel dengan: - Trade ID - Side (Long/Short) -
Entry time dan price - Stop-loss price - Take-profit price - Exit time
dan price - Exit reason (`TP`, `SL`, `end of data`, atau alasan lain
yang eksplisit) - Position size - Risk amount - Gross PnL - Fees - Net
PnL - R multiple - Equity after trade

Sediakan filter Long/Short dan export CSV jika sesuai pola aplikasi.

## 4. Definisi strategi

Nama: **EMA Trend Pullback + RSI + Volume Confirmation**

Strategi ini sengaja dibuat deterministik agar sinyal dapat diuji dan
direproduksi.

### 4.1 Timeframe dan indikator

-   Trend timeframe: `15m`.
-   Entry timeframe: `5m`.
-   EMA 20, EMA 50, EMA 200.
-   RSI 14.
-   ATR 14.
-   Volume SMA 20 pada entry timeframe.

Gunakan candle OHLCV yang sudah close saja untuk kalkulasi sinyal.
Indikator harus dihitung dari data historis berurutan, bukan hanya
window yang sedang terlihat di chart.

### 4.2 Trend filter LONG

Pada candle trend timeframe yang sudah close:

1.  EMA20 \> EMA50.
2.  EMA50 \> EMA200.
3.  Close \> EMA200.

### 4.3 Trend filter SHORT

Pada candle trend timeframe yang sudah close:

1.  EMA20 \< EMA50.
2.  EMA50 \< EMA200.
3.  Close \< EMA200.

Jika tidak ada kondisi trend yang valid, jangan entry.

### 4.4 Entry LONG pada timeframe 5m

Semua syarat berikut harus terpenuhi pada candle 5m yang sudah close:

1.  Trend filter LONG dari candle 15m terakhir yang sudah close.
2.  Harga melakukan pullback ke area EMA20 atau EMA50. Definisikan
    secara eksplisit: `low <= EMA20` atau `low <= EMA50`, dan candle
    tidak menunjukkan harga sudah terlalu jauh di bawah EMA50. Buat
    batas jarak pullback sebagai parameter berbasis ATR agar dapat
    diuji.
3.  RSI14 menyeberang naik melewati 50 pada candle sinyal: RSI candle
    sebelumnya \<= 50 dan RSI candle sinyal \> 50.
4.  Candle sinyal bullish: `close > open`.
5.  Volume candle sinyal \> SMA20 volume.
6.  Tidak sedang memiliki posisi terbuka pada instrumen/strategi yang
    sama.

### 4.5 Entry SHORT pada timeframe 5m

Kebalikan LONG:

1.  Trend filter SHORT dari candle 15m terakhir yang sudah close.
2.  Harga pullback ke area EMA20 atau EMA50 dari sisi bawah; gunakan
    batas jarak berbasis ATR.
3.  RSI14 menyeberang turun melewati 50: RSI sebelumnya \>= 50 dan RSI
    sinyal \< 50.
4.  Candle sinyal bearish: `close < open`.
5.  Volume candle sinyal \> SMA20 volume.
6.  Tidak sedang memiliki posisi terbuka pada instrumen/strategi yang
    sama.

### 4.6 Entry timing

-   Sinyal hanya diketahui setelah candle 5m selesai.
-   Eksekusi simulasi dilakukan pada **open candle 5m berikutnya**,
    bukan pada close candle sinyal.
-   Terapkan slippage pada harga entry sesuai konfigurasi.
-   Jangan menggunakan nilai candle yang belum close.
-   Mapping candle 15m ke candle 5m harus backward-looking: gunakan
    hanya candle 15m yang telah selesai pada waktu sinyal 5m. Jangan
    mengaitkan candle 15m yang masih berjalan.

## 5. Stop-loss, take-profit, dan position sizing

### 5.1 Stop-loss

Gunakan swing structure yang objektif dan konsisten:

-   LONG: swing low terendah dari `N` candle entry timeframe terakhir
    sebelum/termasuk candle sinyal (default `N = 5`), dikurangi buffer
    `0.1 × ATR14`.
-   SHORT: swing high tertinggi dari `N` candle terakhir, ditambah
    buffer `0.1 × ATR14`.

Jadikan `N` dan ATR buffer sebagai parameter strategi. Nilai SL harus
berada di sisi yang benar dari harga entry. Jika SL tidak valid atau
jarak SL nol/terlalu kecil, lewati trade.

### 5.2 Take-profit

Default target `3R`:

-   LONG: `TP = entry + 3 × (entry - SL)`.
-   SHORT: `TP = entry - 3 × (SL - entry)`.

Risk:reward dapat diubah pengguna (misalnya 2.5 atau 3.0), tetapi
default adalah `3.0`.

### 5.3 Risk per trade

Default **1% dari current equity**, bukan 1% dari initial equity.

-   `risk_budget = current_equity × 0.01`
-   `stop_distance = abs(entry_price - stop_price)`
-   Untuk instrumen linear dengan PnL dalam quote currency:
    `raw_qty = risk_budget / stop_distance`.

Namun ukuran posisi final harus memperhitungkan contract size, lot size,
tick size, minimum order size, dan multiplier sesuai metadata instrumen
OKX yang telah tersedia di aplikasi. Jangan mengasumsikan semua pair
memiliki contract size yang sama.

Jika aplikasi belum memiliki metadata yang cukup untuk menghitung ukuran
posisi swap secara benar, batasi versi pertama ke instrumen yang
perhitungan qty-nya dapat dipastikan, dan tampilkan alasan instrumen
tidak didukung. Jangan menghasilkan ukuran posisi yang salah.

### 5.4 Batas risiko dan modal

-   Default risk per trade: `1%`.
-   Default initial equity: `1000 USD`.
-   Satu posisi terbuka per strategi/instrumen pada satu waktu.
-   Tidak ada pyramiding atau martingale.
-   Jangan membuka trade baru jika equity \<= 0.
-   Jika ukuran posisi di bawah minimum exchange, lewati trade dan catat
    alasan.
-   Periksa kebutuhan margin/leverage jika simulasi perpetual swap. Jika
    leverage/margin model tidak tersedia, nyatakan batasan tersebut dan
    jangan menyajikan hasil sebagai simulasi margin yang akurat.
-   Risk 1% adalah risiko nominal berdasarkan jarak entry-SL; gap,
    slippage, biaya, dan eksekusi buruk dapat membuat kerugian aktual
    melebihi 1%.

## 6. Backtest engine --- aturan wajib

Buat engine terpisah dari komponen UI. UI mengirim konfigurasi dan data
OHLCV; engine mengembalikan trade list, equity points, dan metrics.
Hindari business logic di dalam komponen React/Vue/UI.

### 6.1 Data integrity

-   Urutkan candle berdasarkan timestamp ascending.
-   Validasi timestamp duplikat, missing candle, OHLC invalid, volume
    negatif, dan data kosong.
-   Pastikan timezone konsisten (prefer UTC internal).
-   Tangani warm-up indikator: jangan izinkan sinyal sampai EMA200,
    RSI14, ATR14, dan volume SMA20 valid.
-   Tampilkan jumlah candle yang digunakan dan rentang waktu aktual.
-   Jangan mengisi candle yang hilang dengan data sintetis tanpa label
    yang jelas.

### 6.2 Simulasi exit

Untuk setiap candle setelah entry:

-   LONG: SL tersentuh jika `low <= SL`; TP tersentuh jika `high >= TP`.
-   SHORT: SL tersentuh jika `high >= SL`; TP tersentuh jika
    `low <= TP`.
-   Jika SL dan TP tersentuh dalam candle yang sama dan data OHLCV tidak
    menunjukkan urutan intrabar, gunakan asumsi konservatif: **SL
    terjadi lebih dahulu**.
-   Harga exit untuk stop harus memasukkan slippage. TP juga harus
    mengikuti model eksekusi yang terdokumentasi.
-   Posisi yang masih terbuka pada akhir dataset ditutup pada close
    candle terakhir, dengan exit reason `end_of_data`, dan dikenai
    fee/slippage sesuai model.
-   Jangan menganggap TP/SL terisi tepat pada harga target jika gap
    melewati level; tentukan dan dokumentasikan aturan fill yang
    realistis. Minimal, stop gap harus di-fill pada harga open yang
    lebih buruk jika candle membuka melewati SL.

### 6.3 Fees dan slippage

-   Hitung fee pada entry dan exit.
-   Gunakan fee rate yang dipilih pengguna atau konfigurasi fee yang
    benar-benar tersedia dari aplikasi/OKX.
-   Bedakan maker/taker hanya jika model order dan data fee
    mendukungnya. Untuk market-style fill, gunakan taker fee.
-   Slippage harus diterapkan pada entry dan exit dengan arah yang
    merugikan trader.
-   Laporkan gross PnL, fees, slippage estimate (bila dihitung
    terpisah), dan net PnL.
-   Jangan menyembunyikan asumsi biaya dari hasil backtest.

### 6.4 Akuntansi trade dan equity

-   Catat equity sebelum trade, risk budget, quantity, gross PnL, fees,
    net PnL, dan equity setelah trade.
-   Equity berubah saat trade ditutup (closed-trade equity) untuk versi
    pertama; dokumentasikan bahwa kurva ini belum mark-to-market
    intratrade. Jika mudah dan akurat, tambahkan unrealized equity curve
    terpisah.
-   R multiple sebaiknya dihitung dari net PnL dibagi risk budget awal
    trade; tampilkan definisi ini secara konsisten.
-   Profit factor = gross profit dari trade net positif dibagi nilai
    absolut gross loss dari trade net negatif (gunakan net PnL setelah
    biaya; jelaskan definisi).
-   Win rate = trade dengan net PnL \> 0 dibagi seluruh trade tertutup.
-   Expectancy = rata-rata net PnL per trade dan juga rata-rata R.
-   Maximum drawdown dihitung dari puncak equity ke trough berikutnya.
-   Jika tidak ada loss, profit factor dapat ditampilkan `∞` atau `N/A`,
    bukan angka yang menyesatkan.

## 7. Pengambilan data OHLCV dari OKX

-   Gunakan service/client OKX yang sudah ada di repository.
-   Reuse mekanisme pagination, retry, rate-limit handling, instrument
    mapping, dan cache yang ada.
-   Ambil data entry timeframe dan trend timeframe dengan rentang yang
    cukup untuk warm-up indikator.
-   Jika memungkinkan, ambil satu timeframe lalu resample hanya jika
    aturan agregasi candle dan timezone benar; jika tidak, gunakan
    endpoint/data timeframe masing-masing.
-   Pastikan candle terakhir yang masih berjalan tidak dipakai sebagai
    candle sinyal.
-   Hindari request berulang yang tidak perlu; cache berdasarkan
    instrument, timeframe, dan rentang waktu.
-   Tampilkan loading state, error state, data coverage, dan jumlah
    candle.

## 8. Arsitektur yang disarankan

Sesuaikan dengan arsitektur repository; ini pembagian tanggung jawab
konseptual, bukan keharusan nama file.

-   **Bots page:** layout, form konfigurasi, status run, dan hasil.
-   **Strategy definition:** default parameter, validasi konfigurasi,
    deskripsi aturan.
-   **Indicator utilities:** EMA, RSI, ATR, SMA volume.
-   **Signal generator:** menghasilkan sinyal LONG/SHORT dari candle
    close.
-   **Position sizing:** risk 1%, contract/lot/tick rules.
-   **Backtest engine:** iterasi candle, entry/exit, fees, slippage,
    equity.
-   **Metrics calculator:** statistik performa.
-   **OKX market data adapter:** reuse service OHLCV existing.
-   **Persistence (optional):** simpan konfigurasi dan run jika
    database/pola proyek mendukungnya.

Pastikan core engine dapat diuji tanpa browser dan tanpa koneksi
jaringan. Gunakan pure functions jika sesuai dengan stack.

## 9. Parameter default

  Parameter                                                     Default
  -------------------------- ------------------------------------------
  Strategy                                        EMA Pullback Scalping
  Initial equity                                              1,000 USD
  Risk per trade                                                     1%
  Risk:reward                                                       3.0
  Trend timeframe                                                   15m
  Entry timeframe                                                    5m
  EMA periods                                             20 / 50 / 200
  RSI period                                                         14
  RSI trigger                                                        50
  ATR period                                                         14
  Volume SMA                                                         20
  Swing lookback                                              5 candles
  SL ATR buffer                                                     0.1
  Max concurrent positions                                            1
  Pyramiding                                                        Off
  Slippage                                            User-configurable
  Fee                          Existing OKX config or user-configurable

Semua parameter strategi yang memengaruhi sinyal atau hasil harus
terlihat di UI atau dicatat di konfigurasi run. Hindari hidden
constants.

## 10. Testing dan acceptance criteria

Buat unit test untuk:

1.  EMA, RSI, ATR, dan volume SMA dengan fixture yang diketahui.
2.  Trend filter LONG dan SHORT.
3.  RSI cross 50 naik/turun.
4.  Pullback filter.
5.  Entry hanya pada candle berikutnya setelah sinyal close.
6.  Mapping timeframe 15m ke 5m tanpa look-ahead.
7.  Position sizing menghasilkan risiko nominal 1% sebelum biaya.
8.  Quantity rounding sesuai lot size dan tick size.
9.  LONG/SHORT TP dan SL.
10. Candle menyentuh SL dan TP sekaligus --- SL harus menang.
11. Gap melewati SL.
12. Fees dan slippage mengurangi hasil.
13. Equity, winrate, profit factor, expectancy, dan max drawdown.
14. Open position ditutup pada akhir dataset.
15. Data kosong, duplikat, tidak berurutan, dan warm-up tidak cukup.

### Acceptance criteria UI/fungsional

-   `/bots` dapat dibuka dan mengikuti routing aplikasi.
-   Initial equity default terlihat `1000 USD`.
-   Risk per trade default terlihat `1%`.
-   RR default terlihat `3.0`.
-   Pengguna dapat memilih instrumen dan periode backtest dari data OKX
    yang tersedia.
-   Backtest berjalan tanpa membuat order live.
-   Hasil menampilkan metrik, equity curve, dan trade history.
-   Run yang sama dengan data dan konfigurasi identik menghasilkan hasil
    identik.
-   Tidak ada look-ahead bias pada sinyal maupun mapping timeframe.
-   Fee, slippage, dan asumsi fill tercantum jelas.
-   Error data/API ditangani dan ditampilkan dengan baik.
-   Semua test relevan lulus.

## 11. Batasan dan catatan penting

-   Win rate rendah tidak otomatis berarti strategi menguntungkan. Nilai
    utama adalah expectancy positif setelah fee dan slippage.
-   Dengan target 3R, break-even win rate teoretis sebelum biaya adalah
    25%; break-even aktual lebih tinggi setelah biaya, slippage, dan
    gap.
-   Jangan mengoptimalkan parameter pada seluruh dataset lalu melaporkan
    hasil yang sama sebagai bukti performa. Sediakan pemisahan in-sample
    dan out-of-sample atau walk-forward sebagai pengembangan lanjutan.
-   Hasil OHLCV candle-based tidak dapat mengetahui urutan harga
    intrabar; asumsi konservatif wajib digunakan saat SL dan TP
    tersentuh pada candle yang sama.
-   Backtest bukan jaminan hasil live.
-   Jangan menambahkan fitur live execution pada task ini.

## 12. Output yang diharapkan dari Claude Code

Setelah implementasi:

1.  Ringkas perubahan dan file yang dibuat/diubah.
2.  Jelaskan cara membuka dan menggunakan `/bots`.
3.  Jelaskan asumsi fee, slippage, fill, sizing, dan batasan market
    type.
4.  Sebutkan test yang dijalankan beserta hasilnya.
5.  Sebutkan pekerjaan yang belum dapat diselesaikan karena keterbatasan
    data atau infrastruktur existing.
6.  Pastikan tidak ada live order yang dikirim selama implementasi
    maupun pengujian.
