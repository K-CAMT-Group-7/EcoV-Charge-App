# EcoV Charge

[한국어](README.md) · [English](README.en.md) · [ไทย](README.th.md)

> การชาร์จรถยนต์ไฟฟ้าอัจฉริยะที่ยังคงความสะดวกและช่วยลดคาร์บอน

EcoV Charge คือแอปข้ามแพลตฟอร์มที่ช่วยวางแผนการชาร์จรถยนต์ไฟฟ้าในช่วงที่โครงข่ายไฟฟ้ามีความเข้มข้นของคาร์บอนต่ำ เมื่อผู้ใช้เลือกรถ ระดับประจุเป้าหมาย (SOC) และเวลาที่ต้องการให้เสร็จ เซิร์ฟเวอร์จะสร้างและปรับแผนอย่างต่อเนื่องจากข้อมูลพยากรณ์ของ Electricity Maps และข้อมูลจำเพาะของรถ

> [!NOTE]
> ขณะนี้การชาร์จเป็น **การจำลอง** เพื่อทดสอบอัลกอริทึมและประสบการณ์ผู้ใช้ ยังไม่ได้ควบคุมรถหรือเครื่องชาร์จจริงโดยตรง

## คุณสมบัติ

- **เข้าสู่ระบบด้วยบัญชี Google**: เซิร์ฟเวอร์ตรวจสอบ Google ID token จาก Web และ iOS และยืนยันคำขอด้วย session token ที่จัดเก็บในรูปแบบแฮช
- **จัดการรถตามบัญชีผู้ใช้**: เพิ่มรถจากแค็ตตาล็อก Tesla และบันทึกความจุแบตเตอรี่ กำลังชาร์จ ประสิทธิภาพ และชนิดหัวต่อใน PostgreSQL
- **ข้อมูลคาร์บอนตามตำแหน่ง**: แสดงความเข้มข้นของคาร์บอนในโครงข่ายไฟฟ้าปัจจุบันและค่าพยากรณ์ตามตำแหน่งอุปกรณ์ในช่วงเวลา 15 นาที
- **แผนชาร์จอัจฉริยะ**: เมื่อกำหนด SOC เป้าหมายและเวลาเสร็จ ระบบจะเลือกช่วงพยากรณ์ 5 นาทีที่มีความเข้มข้นของคาร์บอนต่ำก่อน
- **ปรับแผนแบบต่อเนื่อง**: คำนวณใหม่ทุกขอบเวลา 5 นาทีจาก SOC ที่เหลือและข้อมูลพยากรณ์ล่าสุด พร้อมให้ความสำคัญกับการชาร์จให้ทันกำหนดเมื่อเวลาเหลือน้อย
- **ควบคุมโหมดการชาร์จ**: หยุดการชาร์จอัจฉริยะ เปิด `Force top up` เพื่อข้ามการปรับให้เหมาะสม หรือกลับสู่โหมดอัจฉริยะได้
- **ผลกระทบและประวัติ**: เปรียบเทียบการปล่อยโดยประมาณกับกรณีชาร์จทันที และดูพลังงาน SOC และ CO₂ ที่ประหยัดได้จากเซสชันที่เสร็จแล้วแยกตามรถ
- **รองรับหลายแพลตฟอร์ม**: ใช้โค้ด Expo ชุดเดียวบน iOS, Android และ Web

หากไม่มีข้อมูล Electricity Maps หรือตำแหน่ง หน้าหลักจะแสดงค่าพยากรณ์สำรองตามภูมิภาค ส่วนการสร้างและปรับแผนชาร์จอัจฉริยะต้องมี API server, ฐานข้อมูล และการตั้งค่า Electricity Maps API ที่พร้อมใช้งาน

## ขั้นตอนการใช้งาน

1. เข้าสู่ระบบด้วย Google และอนุญาตการเข้าถึงตำแหน่ง
2. เพิ่มรถเข้าในบัญชีที่ `My vehicles`
3. ที่หน้าหลัก เลือกรถและดูความเข้มข้นของคาร์บอนในพื้นที่พร้อมผลกระทบสะสม
4. ที่ `Start charging` เลือก SOC เป้าหมายและเวลาเสร็จ แล้วตรวจสอบ CO₂ ที่คาดว่าจะประหยัดได้
5. เริ่มการชาร์จอัจฉริยะ ติดตามความคืบหน้า หรือหยุด/เปิดโหมดบังคับชาร์จ
6. เปิด `Charging record` เพื่อดูเซสชันที่เสร็จแล้ว พลังงานที่ใช้ และ CO₂ ที่ประหยัดได้แยกตามรถ

## หลักการทำงาน

เซิร์ฟเวอร์คำนวณพลังงานที่ต้องการจากความจุแบตเตอรี่ กำลังชาร์จ AC ประสิทธิภาพการชาร์จ และ SOC ปัจจุบัน/เป้าหมาย จากนั้นเรียงช่วงเวลา 5 นาทีก่อนถึงกำหนดตามความเข้มข้นของคาร์บอนและเลือกจำนวนช่วงที่จำเป็น การจำลองจะใช้กำลังสูงสุดเมื่อช่วงเวลาปัจจุบันถูกเลือก และใช้ 0 kW เมื่อไม่ถูกเลือก เซสชันที่ทำงานอยู่จะปรับแผนทุก 5 นาทีด้วยวิธี receding horizon

ค่าประหยัดโดยประมาณมาจากการเปรียบเทียบแผนที่ปรับให้เหมาะสมกับกรณีชาร์จทันทีด้วยกำลังสูงสุดภายใต้เงื่อนไขเดียวกัน ผลการควบคุมทุกครั้งถูกบันทึกใน PostgreSQL และเซสชันที่เสร็จหรือหยุดจะถูกรวมเป็นประวัติการชาร์จและผลจำลองจริง ดูรายละเอียดได้ที่ [เอกสารอัลกอริทึมการชาร์จแบบต่อเนื่อง](docs/active-charging-algorithm.md)

## สถาปัตยกรรมทางเทคนิค

- **ไคลเอนต์**: Expo SDK 54, React Native 0.81, React 19.1, Expo Router 6, TypeScript
- **การยืนยันตัวตน**: Google Sign-In / Google Identity Services, bearer session, Expo SecureStore
- **เซิร์ฟเวอร์**: Go 1.25, Fiber v3, ตัวจัดตารางชาร์จเบื้องหลัง
- **ข้อมูล**: PostgreSQL 17, `pgx`, SQL migration แบบฝังในไบนารี
- **ข้อมูลภายนอก**: ข้อมูลพยากรณ์คาร์บอนจาก Electricity Maps ตำแหน่งอุปกรณ์ และ reverse geocoding
- **เครื่องมือ**: Bun 1.3, Oxlint, Oxfmt, Bun Test, Go test
- **การส่งมอบ**: Docker image แบบ multi-stage/non-root, Docker Compose และ GitHub Actions สำหรับ build และเผยแพร่ไปยัง GHCR

```mermaid
flowchart LR
    A["แอป Expo<br/>iOS · Android · Web"] -->|"Google ID token / bearer session"| B["Go Fiber API"]
    B --> C[("PostgreSQL")]
    B --> D["Electricity Maps API"]
    B --> E["ตัวจัดตารางทุก 5 นาที"]
    E --> C
```

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมี

- [Bun](https://bun.sh/) เวอร์ชัน 1.3 ขึ้นไป และ Node.js LTS
- Go 1.25 ขึ้นไป
- Docker และ Docker Compose สำหรับ PostgreSQL
- สภาพแวดล้อมพัฒนาแบบ native สำหรับ iOS หรือ Android
- Google OAuth client ID และ Electricity Maps API key

Google Sign-In ใช้ native module ดังนั้นบน iOS ต้องใช้ development build แทน Expo Go

### ติดตั้งและตั้งค่า

```bash
bun install
cp example.env .env
```

แทนที่ placeholder ใน `.env` ด้วยค่าจริง และห้ามใส่ secret ของเซิร์ฟเวอร์ในตัวแปร `EXPO_PUBLIC_*`

```dotenv
ELECTRICITYMAPS_API_URL="https://api.electricitymaps.com/v4"
ELECTRICITYMAPS_API_KEY="YOUR_API_KEY_HERE"
DATABASE_URL="postgres://ecov_charge:ecov_charge@localhost:5432/ecov_charge?sslmode=disable"
GOOGLE_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"

EXPO_PUBLIC_SERVER_API_URL="http://localhost:8080"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"
```

`GOOGLE_CLIENT_ID` และ `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` ใช้ Web client ID เดียวกัน ส่วน iOS ต้องสร้าง client ID แยกสำหรับ bundle ID `com.ecovcharge.app` ดูการตั้งค่า OAuth และตัวแปรเซิร์ฟเวอร์ทั้งหมดได้ใน [README ของเซิร์ฟเวอร์](apps/server/README.md)

หากต้องการเปลี่ยน reverse-geocoding endpoint ที่ใช้บน Web ให้ตั้งค่าตัวแปรเสริม `EXPO_PUBLIC_LOCATION_GEOCODER_URL` ตามที่อธิบายใน `example.env`

### รันในเครื่อง

รันแต่ละคำสั่งในเทอร์มินัลแยกกัน:

```bash
bun run db:up
bun run server:dev
bun run dev:clear
```

เลือกแพลตฟอร์มจากเทอร์มินัล Expo หรือเปิดโดยตรง:

```bash
bun run ios
bun run android
bun run web
```

### รันเซิร์ฟเวอร์ด้วย Docker

`compose.server.example.yaml` เป็นตัวอย่างสำหรับรัน API และ PostgreSQL ร่วมกัน

```bash
docker compose -f compose.server.example.yaml up --build
```

การเปลี่ยนแปลงแบ็กเอนด์บนสาขา `main` และแท็ก `v*` จะถูก build และเผยแพร่ไปยัง GitHub Container Registry ด้วย GitHub Actions ส่วน Pull Request จะตรวจสอบการ build โดยไม่เผยแพร่ image

### ตรวจสอบโค้ด

```bash
bun run check
bun run test
bun run server:check
bunx expo-doctor
```

## โครงสร้างโปรเจกต์

```text
.
├── apps/server/       # Go Fiber API, scheduler, DB migration, Dockerfile
├── assets/            # รูปภาพแอป แบรนด์ และรถ
├── docs/              # เอกสารอัลกอริทึมการชาร์จแบบต่อเนื่อง
├── scripts/           # backtest การชาร์จแบบ local และ global
├── src/
│   ├── app/           # หน้าล็อกอิน หน้าหลัก รถ การชาร์จ และประวัติ
│   └── packages/      # โมดูล auth, server API, location, vehicle และ charging
├── compose.yaml       # PostgreSQL สำหรับพัฒนาในเครื่อง
├── compose.server.example.yaml # ตัวอย่าง API + PostgreSQL
├── example.env        # ตัวอย่างตัวแปรแวดล้อมของไคลเอนต์และเซิร์ฟเวอร์
└── package.json       # สคริปต์แอป การตรวจสอบ เซิร์ฟเวอร์ และฐานข้อมูล
```

## คุณค่าหลัก

**Plug in. Set your target. Charge cleaner.**

EcoV Charge ช่วยให้ผู้ใช้ชาร์จเสร็จตามกำหนดและเลือกช่วงเวลาที่ยั่งยืนกว่า โดยไม่ต้องวิเคราะห์ข้อมูลโครงข่ายไฟฟ้าที่ซับซ้อนด้วยตนเอง
