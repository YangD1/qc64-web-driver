# M6 Lite+ HID 协议 (VID 2233 / PID 006B)

> 本文为 QC64（M6 Lite+）HID 协议逆向笔记。文中 `kbd.py` 是逆向期间使用的 Python 验证脚本，未包含在本仓库；网页驱动的实现见 `src/protocol/`。
> Reverse-engineering notes for the QC64 (M6 Lite+) HID protocol. `kbd.py` refers to a private Python test script not included here; the web implementation lives in `src/protocol/`.

## 物理层
设备 4 个 HID 接口（USBPcap2 / bus 2 / addr 12，地址会随重新插拔变化）：

| 接口 | 端点 | 包长 | 用途 |
|---|---|---|---|
| MI_00 | 0x81 IN | 7  | 普通键盘报告 |
| MI_01 | 0x82 IN / 0x02 OUT | 16 / 2 | 多媒体/NKRO + LED |
| **MI_02** | **0x83 IN / 0x03 OUT** | **21** | **驱动私有协议（MMPanel 用这个）** |
| MI_03 | 0x84 IN / 0x04 OUT | 21 | 未见流量（可能是 2.4G/IAP 用） |

## 加密
每包 21 字节。`byte0` = report id `0x04`（= HEAD_CMD.HAND），**明文**。
`byte1..20` 与固定密钥逐字节 XOR，无会话协商（两次启动报文完全一致）：

```
OUT key (host->kbd): 8e 96 ce 6a f2 72 99 48 58 61 27 58 e8 9a 7f 01 95 ee ed 2f   (MMPanel.exe 文件偏移 0x184b9da)
IN  key (kbd->host): 6a 6d 64 66 3f 2e f0 43 0a 41 ea 8f 2b fc e0 e7 d5 52 7b a5   (MMPanel.exe 文件偏移 0x182b078)
```
OUT key 在 exe 里之后还有很长一段随机字节（可能是更长包/其它型号用的密钥流），暂未用到。
解密工具: `decode.py <pcapng>`

## 明文格式（初步）
```
[0] 0x04 包头 (HEAD_CMD.HAND)
[1] MASTER 命令
[2..20] 数据
```
响应的 [1] 回显命令字。

## 启动握手
| 请求 | 响应 | 推测 |
|---|---|---|
| `04 10 00…` | `04 10 00 00 00 00 00 00 00 02 02 09 00…` | 设备信息/固件版本？ [9..11]=02 02 09 → v2.2.9? |
| `04 01 00…` | `04 01 00…` 全 0 | DRIVER/SLAVE_INIT |
| `04 02 00…` | `04 02 00 00 00 01 02 0e 01 00…` | DEV（设备配置），对照 DEV_INDEX 待定 |

MMPanel 启动时只发这 3 条，之后空闲时无轮询。

## 型号命名空间: 枚举与 M61P 吻合（**实际为 QC64**，见后文）
**修正帧格式**：`byte0`=report id 0x04（明文），之后（解密后）才是 M61P 各 `*_INDEX` 枚举的下标 0：
```
raw[0]  0x04 report id
p[0]    PACK_HEAD = HEAD_CMD   (0x10 DEV_INFO, 0x08 MASTER_PROC, 0x02 FAST_CONN, 0x04 HAND ...)
p[1]    MASTER    = MASTER_CMD (HEAD=0x08 时)
p[2..]  按对应 *_INDEX 枚举
```
多字节值为小端。启动的 `04 01`/`04 02` 需要按此重新理解（01/02 在 p[0] 位置 → 02=FAST_CONN?）。

## 写入流程
驱动**不在打开页面时读取**，只在改设置时写；每次写后跟一个对应 `*_CRC` 命令。

### MAG_CFG (0x31) 单键磁轴设置 @93.3s
```
-> 08 31 01 00 00 00 01 1e00 ee02 0a00 f401 f401 0100 00
   HEAD MAG_CFG CMD_TYPE=1 LAYER=0 ROW=0 COL=0 RT_ON=1
   RT_HEAD=30 RT_DOWN=750 RT_UP=10 FIX_DOWN=500 FIX_UP=500 RT_BOTTOM=1 RT_HEAD_TRIG=0
<- (见下"IN 异常")
-> 00 00…（全 0，意义不明）
-> 08 c9 00 788c2be1        MAG_CFG_M1_CRC(201): CRC_LAYER=0, CRC_VALUE=0xe12b8c78 (LE)
<- 00 fe fe 01 00 01 00 0c 08 00 fe 01 00 01 00 0c 00 ff 00 00   (~150ms 后)
```
单位待定（可能 0.001mm：0.75/0.01/0.5mm）。

### KEY (0x03) 按键重置 @103.9s
```
-> 08 03 02 00 0000 02 00 …   KEY_CMD_TYPE=2 PROG_SINGE_RESET, MEM=0, ALL_STEP=0, ROW=2, COL=0
-> 08 c1 00 991a2546          KEY_M1_CRC(193): layer 0, CRC=0x46251a99
<- 同上 fe fe 01… 响应
```
CRC 覆盖范围和算法未知（推测整层配置表的 CRC32，需要更多样本）。

### IN 异常
写命令后的第一个 IN 包：`raw = 04 6a a4 fe 01 00 01 00 0c 08 00 fe 01 00 01 00 0c 00 ff 00 00`
只有 raw[1..2] 像是加密的（解出 `00 c9` / KEY 时 `00 c1` = 即将发送的 CRC 命令号），
raw[3..] 却是明文，正好等于随后那个正常加密的响应解密后的 p[2..]。
推测固件复用了响应缓冲区/部分加密，暂不深究。

## 背景光效
光效写入**没有 CRC 包，也没有 IN 响应**，拖动滑块时每 ~30ms 发一包。

### MB (0x05) 背景灯效 — MB_INDEX
```
p: 08 05 MODE DIR SPEED1(u16) SPEED2(u16) IS_CUSTOM_RGB R G B
08 05 02 00 0000 0000 01 00 ff ee   NORMALLY 常亮, 自定义色 RGB(00,ff,ee)；改色时只变 R/G/B
08 05 05 01 1f10 0000 00 17 c4 cd   STREAM 流光, DIR=1, SPEED1=4127, 非自定义色
08 05 04 00 1027 …                  GRADIENT 渐变, SPEED1 滑块 10000→15984→5000（值越大越慢?）
08 05 01 00 f401 0100 00 05 84 00   EQ 律动: SPEED1=500 SPEED2=1, EQ_MODE=0, EQ_BUTTOM_MODE=5, EQ_MAIN_GAIN=0x84
```
MODE 取值见 MB_MODE_CMD（0 NONE,1 EQ,2 常亮,3 呼吸,4 渐变,5 流光,6 星光,… 23 HELIX, 254 DARK）。

### 亮度 = DEV(0x02) + LIGHT_CFG(0x11) 成对发送
```
08 02 00 00 00 01 01 00 01 0a 01 05 …
   DEV_INDEX: DEV_MODE=0 TRANS_MODE=0 KEY_LAYER=0 PFM_MODE=1 KEY_FILTER=1 WIN_LOCK=0
              WIRELESS_SLEEP=1 SLEEP_DELAY=10 FAST_SLEEP=1 FAST_SLEEP_DELAY=5 IS_FN_SWAP=0 …
08 11 ff ff ff f8 00 01 01 01 00 01 ff 00 00 01 0a 07 08 50
   LIGHT_CFG_INDEX: BAOHE_RGB=ff,ff,ff  SW_BRIGHT=0xf8(滑块 f8→9d)  DYN_BRIGHT=0
   BUTTOM/TOP/ENTER_ACTIVED=1,1,1 ENTER_UNIFY=0 CIRCLE_ACTIVED=1 CIRCLE_BRIGHT=ff
   CIRCLE_SYNC=0 DWB_AND_SYNC=0 DWB_BRIGHT=1 MT_BREATH_SPEED=0a MT_GRADIENT_SPEED=07
   ME_ARGB_SPEED=08 ME_SPREAD_SPEED=0x50
```

## 氛围灯
同样无 CRC、无响应。

### MC (0x0b) 氛围灯效 — MC_INDEX（注意 p[2] 未命名，恒 00，可能是分区号）
```
p: 08 0b 00 MODE SPEED1(u16) SPEED2(u16) IS_CUSTOM_RGB R G B
08 0b 00 05 b80b 0000 00 000000   STREAM 流光 speed=3000
08 0b 00 03 d007 0000 00 ff00ff   BREATH 呼吸 speed=2000, RGB(ff,00,ff)
08 0b 00 06 c409 0000 00 000000   STAR 星光 speed=2500
08 0b 00 04 1027 0000 00 000000   GRADIENT 渐变 speed=10000
08 0b 00 07 0000 0000 00 0dff55   NORMALLY 常亮 RGB(0d,ff,55)
```
MODE: 1 APM_GRADIENT,2 APM_STREAM,3 BREATH,4 GRADIENT,5 STREAM,6 STAR,7 NORMALLY,8 BLINK,9 APM_REPTILE,10 TIMER,11 BUMP,12 LAZER,13 HORSE。
IS_CUSTOM_RGB 这里都为 0 但 RGB 仍有值。实测 `08 0b 00 07 0000 0000 00 00 48 ff`（flag=0）即生效为该颜色 → 常亮模式下 RGB 直接使用。

### 氛围灯亮度
与背景亮度相同的 DEV(0x02)+LIGHT_CFG(0x11) 成对包，变化的是 **p[12] CIRCLE_BRIGHT**（f5→bb→ff）。

## 单键光效
只有 MT 包，无 CRC、无响应；调色盘拖动时每 ~35ms 一包。

### MT (0x08) 单键灯 — MT_INDEX（注意 **COL 在 ROW 前面**）
```
p: 08 08 CMD_TYPE COL ROW ACTIVE MODE A R G B
08 08 01 00 00 01 01 ff ff 00 ff   SINGLE, 键(col0,row0)=Esc?, 启用, NORMALLY, A=ff, RGB(ff,00,ff)
08 08 01 0d 00 01 01 ff ff 00 ff   键(col13,row0)
```
CMD_TYPE (MT_CMD): 1 SINGLE,2 ROW,3 WASD,4 ARROW,5 ALL_SET,6 ALL_RESET,7 ALL_DATA_START,8 ALL_DATA_GET
MODE (MT_MODE_CMD): 1 NORMALLY,2 BREATH,3 GRADIENT。A 恒为 ff（alpha/亮度?）。
ALL_DATA_GET 说明设备支持读回整表，但驱动平时不用。

## 按键页
### KEY (0x03) 预设开关 + 写后 CRC 握手
```
-> 08 03 09 00…            KEY_CMD_TYPE=9  WASD_DKS_SET_ON
<- 00 c1 <乱码>            设备立即回: p[1]=要求/确认的 CRC 命令号 (KEY_M1_CRC=0xc1)
-> 08 c1 00 e866f594        KEY_M1_CRC layer0 CRC=0x94f566e8
<- 00 fe fe 01 00 01 00 0c 08 00 fe 01 00 01 00 0c 00 ff 00 00   ~1.2s 后，推测 SAVE_END(0xfe)=存储完成
-> 08 03 0a 00…            KEY_CMD_TYPE=10 WASD_DKS_SNAP_SET_OFF
-> 08 c1 00 991a2546        CRC=0x46251a99（= 02_ops 里单键重置后的 CRC → 默认键表的 CRC）
```
**结论**: `*_CRC` 是整层配置表的校验值，同样状态 → 同样 CRC。可用于将来验证 CRC 算法（需知道键表内容）。
"IN 异常"重新解释: 第一个响应 p[2..] 不是有效数据（未初始化缓冲区），只有 p[0..1] 有意义。

### HOOK_OP (0xe1) / HOOK_ED (0xe2)
`08 e1 00…` / `08 e2 00…` 无参数，相隔 6s。推测是驱动进入/退出"按键捕获"状态（点选按键时让键盘暂停正常输出或上报），待确认。

### KEY (0x03) 单键改映射— KEY_PROG_INDEX
**目标键也用矩阵 (row,col) 表示，不是 HID 键码。**
```
p: 08 03 CMD MEM ALL_STEP(u16) ROW COL KEY_MODE KEY_TYPE DES_ROW DES_COL … [16]MODE
08 03 01 00 0000 03 04 00 00 04 05 00… [16]=01   SINGE_SET 键(r3,c4) → 普通键(r4,c5)   KEY_MODE=0 MOD
08 03 02 00 0000 03 04 00…                          SINGE_RESET 键(r3,c4) 恢复
08 03 01 00 0000 03 02 02 01 02 00 00…              SINGE_SET 键(r3,c2) → 多媒体: KEY_MODE=2 MEDIA,
                                                     MEIDA_BYTE=1 MEIDA_DATA=0x02 UP_CLEAR=0
                                                     （推测对应 EP82 report 01 的 byte1 bit1 位图）
08 03 02 00 0000 03 02 00…                          SINGE_RESET 键(r3,c2)
```
每条都跟 `<- 00 c1` → `08 c1 00 <CRC>` → `<- 00 fe` 握手。
改键前后有 HOOK_OP(e1)/HOOK_ED(e2)，印证是"按键捕获"开关（HookMode: KB=1, FULL）。
key_mode_t（取自 A68，推测通用）: 0 MOD,1 PROG,2 MEDIA,3 FN,4 DKS,5 SNAP；key_type_t: 0 KEY,1 MOUSE。
KeyList（矩阵→键名表）静态数据被保护壳清空，行列与键名的对应要靠抓包积累。

## 按键宏页— 未出现 KEY_SEQ(0x04)，只有 KEY SINGE_SET
```
08 03 01 00 0000 02 01 00 00 03 01 00 00 00 00 02 14   键(r2,c1) → (r3,c1), [16]MODE=2, [17]KEY_HOT_INTERVAL=20
08 03 02 … 02 01                                       RESET (r2,c1)，CRC 回到 0x2d5cfbc4
08 03 01 00 0000 03 00 04 00 04 00 00 00 00 00 00 14   键(r3,c0) KEY_MODE=4(DKS?) p[10]=4, [16]=0, [17]=20
08 03 02 … 03 00                                       RESET (r3,c0)
```
推测 p[16] MODE 对应 ProgMode（0 Normal,1 Change,2 Hot,3 Prog,4 Media…）：06b 普通改键 MODE=1=Change，这里 MODE=2=Hot(热键/组合键)。
第二条含义不确定。真正的宏序列 (KEY_SEQ 0x04, SEQ_INDEX: SEQ_CMD MEM ALL_PACK_CNT(u16) CUR_PACK_NUM(u16) LAST_PACK_STEP
KEY_COL KEY_ROW ALL_STEP(u16) STEP_INTERVAL(u16) STEP_TYPE STEP_COL STEP_ROW STEP_STATUS) 尚未抓到。

### 高级键— 全部作用在键(r2,c1)，都是 KEY SINGE_SET
```
08 03 01 00 0000 02 01 04 00 03 03 …[16]00 [17]14   KEY_MODE=4 DKS,   DES=(3,3), KEY_DKS_INTERVAL=20
08 03 01 00 0000 02 01 05 00 03 03 …                KEY_MODE=5 SNAP 后覆盖, DES=(3,3)
08 03 01 00 0000 02 01 06 00 03 01 …                KEY_MODE=6 抵消(CL / AD_CANCEL), DES=(3,1)
08 03 01 00 0000 02 01 00 00 03 01 …                KEY_MODE=0, DES=(3,1) → CRC 与复位相同 = 该键默认值
08 03 01 00 0000 02 01 00 00 04 05 …[16]01          普通改键 → DES=(4,5), MODE=1
每项后 08 03 02 … 02 01 复位，CRC 回到 0xa9300fba
```
**KEY_MODE (M61P)**: 0 MOD 普通/改键, 2 MEDIA, 4 DKS, 5 SNAP 后覆盖, 6 抵消；推测 1 PROG, 3 FN（未抓到）。
**重要**: (r2,c1) 的默认值是 DES=(3,1) → DES_ROW/DES_COL 不是物理矩阵坐标，而是键码表
(KEY_CHAR_LIST[row,col]) 的下标；KEY_ROW/KEY_COL 才是物理位置。
DKS/SNAP 的第二个键、各行程阈值应在别的包里（MAG_CFG? 或 DKS 专用页），本次未见额外包 → 待查。

## 磁轴
### MAG_CFG (0x31) 再次确认
`08 31 01 00 00 00 01 1e00 d502 0a00 f401 f401 0100 00` — 与 02_ops 相比只有 RT_DOWN 750→**725**，
后续握手同样是 `<- 00 c9` → `-> 00 00…`（全 0 包） → `08 c9 00 <CRC>` → `<- 00 fe`。
（MAG_CFG 的握手比 KEY 多一个全 0 包，原因未知。）本次未抓到 RT 开/关和其它键。

### MAG_CAL (0x30) 校准 — MAG_CAL_INDEX / MAG_CAL_CMD
```
-> 08 30 01 …   MANUAL_CAL_START
<- 08 30 11 00 00 0f 94 06 06 0a ff 00 00 00 00 ff 00 00 00 00   校准中设备主动上报（~每次按键变化）
   … p[5..6] 0f94→0f8e, 之后 p[5..6]=10dd→10c1 且 p[8] 06→15
-> 08 30 03 …   MANUAL_CAL_CANCEL
```
上报格式推测: p[2]=0x11 上报类型, p[5..6] 大端 ADC/磁感原始值(~4000), p[7..8] 可能是键 (row,col) 或进度，待更多样本。
这是目前唯一一个**设备主动上报**的命令，且 IN 包在 p[0]=08 处正常解密。

## 设置页
只有一次 DEV(0x02)+LIGHT_CFG(0x11) 成对写入：DEV p[14] 0→1（QC64: **DYN_SCAN** 动态扫描；M61P 名 TC_ENABLE），其余不变。
→ 设置页所有开关都走 DEV(0x02) 整包写（DEV_INDEX 各字段），并总是附带一个 LIGHT_CFG 包。

## 命令总表（M61P，已抓到的）
| p[0] | p[1] | 名称 | 说明 | 写后握手 |
|---|---|---|---|---|
| 10 | — | DEV_INFO | 启动读设备信息 | 有响应 |
| 08 | 02 | DEV | 设备设置整包（休眠/WinLock/FN交换/TC 等） | 无 |
| 08 | 03 | KEY | 改键/媒体/DKS/SNAP/抵消/WASD 预设 | c1 CRC |
| 08 | 05 | MB | 背景灯效 | 无 |
| 08 | 08 | MT | 单键灯 | 无 |
| 08 | 0b | MC | 氛围灯 | 无 |
| 08 | 11 | LIGHT_CFG | 亮度/各灯区开关 | 无 |
| 08 | 30 | MAG_CAL | 校准开始/取消 + 设备上报 0x11 | 上报 |
| 08 | 31 | MAG_CFG | 单键磁轴行程/RT | c9 CRC |
| 08 | c1/c9 | KEY_M1_CRC / MAG_CFG_M1_CRC | 层号 + CRC32? LE | 设备回 fe |
| 08 | e1/e2 | HOOK_OP/HOOK_ED | 按键捕获开始/结束 | 无 |

## 实测写入（kbd.py, hidapi）
`python kbd.py color 255 0 0` → 键盘背光变红 ✔。`info` 响应与抓包一致。加密/帧格式/写入路径全部验证。

## 真实型号命名空间是 QC64（不是 M61P）
`%APPDATA%\MMPanel\QC64\0000\MEM\` 下有驱动本地保存的配置（.NET BinaryFormatter）：
`KEY_M1.bin`(full_key_prog: key[,] 含 mod/layer/prog/media/dks/snap/cancel)、`MAG_CFG_M1.bin`(mag_cfg: mag_key_cfg[5,14])、EQ_GAIN、PIC/GIF_PATH。
QC64 与 M61P 枚举几乎相同，差异: MASTER_CMD 27=BK(非 MD)；DEV_INDEX [6]=CBK_ACTIVED [12]=IS_FN_ALT_SWAP [14]=**DYN_SCAN**(09_settings 改的是它)；
LIGHT_CFG [14]=PLATE_SYNC_ACTIVED [15]=MONITOR_ACTIVED；MAG_CFG 无 RT_HEAD_TRIG。
矩阵 5 行 × 14 列（70 格，其中 6 格 rt_on=0 为空位）。

## MAG_CFG CRC（已解，magcrc.py）
- **STM32 硬件 CRC32**：poly 0x04C11DB7，非反射，按 **32 位小端字** 喂入（字节流里每 4 字节倒序）。
- 固件磁轴表 = **5×14 行优先，每键 23 字节记录**；驱动已知的 14 字节 mag_key_cfg
  (rt_on, nullA, u16 LE: head, down, up, fix_down, fix_up, bottom) 位于记录内；其余 9 字节未知但恒定。
- 因 CRC 仿射：`CRC(state) = C0 ^ L(state)`，L 只依赖 70 个 14 字节结构体。
  C0 用一对已知 (状态, CRC) 求出：以 MAG_CFG_M1.bin(23:41 版) + 0x737c153b 得 **C0 = 0x9b967f0f**
  （与布局常量 MEM_LEN/BASE 绑定）。
- 验证：08b×2、08c 多字节写入、02_ops 共 4 个样本全部命中。
- 推导过程：差分法（单字节差 → poly + 距表尾偏移），样本 3 的高/低字节顺序暴露 32 位字交换，
  换算回内存后 (0,0)→(2,1) 距离 667 = 29×23。
- 未验证前提：那 9 字节在不同键盘/固件间是否也不变（按键表 KEY_M1_CRC 需同法另推）。

### 实测 MAG_CFG 写入（kbd.py mag）
`python kbd.py mag 2 1 0x55 0x4b` → 设备 `<- 00 c9`，CRC 0x963f2c0d，`<- 00 fe`；
`python kbd.py mag 2 1 0x4b 0x4b`（恢复）→ CRC 0x737c153b（= 已知值），`<- 00 fe`。
**错误 CRC 对照（结果：设备不区分）**：CRC^1 与正确 CRC 的响应序列完全相同：
`<- 00 c9`(0ms) `<- 00 fe`(150ms) `<- 00 fe`(300ms)，即 3 个 OUT 包各回一个 ACK，payload 为缓冲区垃圾。
→ 设备写入时**不校验/不拒绝** CRC，响应不能用来验证 CRC；CRC 可能只是被固件存下供驱动做同步判断（读取路径未见）。
→ 我们的 CRC 与驱动生成值逐位一致（4 个抓包样本 + 恢复时复现 0x737c153b），按驱动行为发送即可。
最终状态：A 键已用正确 CRC 恢复为 0x4b/0x4b，与 MAG_CFG_M1.bin 一致。
注意：kbd.py 写入后 MMPanel 的 MAG_CFG_M1.bin 不会同步；恢复原值后二者一致。

## 物理矩阵（5×14，由 MAG 表 rt_on=0 的空位推出，**单键灯实测已确认**：WASD/LShift(c0,r3)/LCtrl/Space/方向键）
```
row0 ##############   Esc 1..0 - = Bksp
row1 ##############   Tab Q W … \           W=(c2,r1)
row2 ############.#   Caps A S D … ' _ Enter  A=(c1,r2) S=(c2,r2) D=(c3,r2)
row3 ##############   LShift Z … / RShift Up(c12) (c13)
row4 ###...#..#####   LCtrl(c0) Win(c1) Alt(c2) Space(c6) RAlt(c9) Fn(c10 实测) Left(c11) Down(c12) Right(c13)
```
MT 单键灯 `08 08 01 COL ROW 01 01 ff R G B` 按这些坐标设 WASD/LCtrl/Space/方向键。

## KEY 表 CRC（0xc1）— 部分解出 + 设备不校验（2026-09-25）
- **设备不校验**：`kbd.py keyset 1 1 2 2`（CRC=0）→ 设备 `<- 00 c1`、`<- 00 fe` 正常 ACK，Q 键实际打出 w ✔。
  → 与 MAG 相同，CRC 只需与 MMPanel 保持一致；自研驱动可以不算。
- 已知部分（差分，工具 nrbf.py + scratch/）：STM32 CRC32（同 MAG），**每键记录 46 字节**，行优先 5×14；
  键(2,1) 的 mode 字节距 CRC 缓冲区末尾 D=10447 字节（word-swap 模型下，见 scratch/dict.py 的 Lm）。
  吻合样本：07b DKS/SNAP/CANCEL（单字节 mode=4/5/6）、06 WASD_DKS_ON（W/A/S/D 4 个 mode 字节，R=46 精确）。
  未解：记录内其他字段偏移；06b/07_macro 的 MOD/MEDIA/HOT 差分不是 ≤2 字节（RESET 可能恢复多个字段）。
- 驱动本地 KEY_M1.bin（BinaryFormatter）可用 `nrbf.load()` 读取；07b 结束时保存，对应 CRC 0xa9300fba。

## 键码下标规则（已验证）
改键 DES(row,col) 是键码表下标；**键 (r,c) 的默认键码 = (r+1, c)**。
实测：键(1,1)=Q 设 DES=(2,2) → 打出 W（W 是键(1,2)）。

## kbd.py 实测高级键（2026-09-25，全部 CRC=0，设备照常生效）
`keyadv R C MODE DR DC [INTERVAL]` → `08 03 01 00 0000 R C MODE 00 DR DC 00 00 00 00 00 INTERVAL(u16)`
- **SNAP(5)** A↔D 互设：按住 A 再按 D → 只出 d；松 D → 恢复 a。✔
- **CANCEL(6)** A↔D 互设：按住 A 再按 D → 都不输出；松 D → 恢复 a。✔
- **DKS(4)** A→B(des 4,5) interval 20：**按下=原键 A（按住正常连发），松开时补发一次目标键 B**
  （点按→"ab"，长按→"aaaa…ab"）。interval 推测为 B 的按下时长/延迟(ms)。DES(4,5)=B 同时印证键码规则。
- 恢复：`keyreset R C`（只需 SINGE_RESET）。

## MAG_CAL 校准上报格式（已解，kbd.py calwatch，2026-09-25）
`calwatch N`：发 START(08 30 01)，N 秒内打印上报，最后必发 CANCEL(08 30 03) → 不保存任何校准。
用户依次慢按 Esc、A、空格到底：
```
<- 08 30 11 00 00 | IDX | MIN(u16 LE) | REST(u16 LE) | ff 00 00 00 00 ff 00…
   IDX = 物理键序号 = PHY_KEY_LIST 下标（只数 64 个真实键，见 KEYMAP.md）：Esc=0, A=29=(2,1), 空格=58=(4,6)
   （更正：早先写成 row*14+col，空格会算成 (4,2)=LAlt，错误）
   MIN   按压过程中的最小 ADC，随下压单调减少（Esc 0x075c→0x0652，只在变小时上报）
   REST  该键静止值（Esc 0x09ee, A 0x09fc, 空格 0x0a32），整个按压过程不变
```
行程约 REST-MIN ≈ 900 counts。（08_mag 里旧的"大端 0f94"猜测作废：那是 IDX=0x0f=PHY[15]=(1,1) + MIN 0x0694 + REST 0x0a06。）
未测：MANUAL_CAL_END(2) 保存 / RESET(4) —— 会改写校准数据，暂不实测。

## RT 开关
UI：键程设置 → 键盘下方「机械轴模式」=RT_ON 0，「RT」=RT_ON 1。就是 MAG_CFG(0x31) 的 RT_ON 字节，其余字段不变：
```
-> 08 31 01 00 02 01 00 1e00 4b00 4b00 f401 f401 0100   A 键 机械轴模式  → CRC 0xac318d65
-> 08 31 01 00 02 01 01 …                               A 键 RT          → CRC 0x737c153b
```
magcrc.py 对两个 CRC 预测完全一致（第 5、6 个验证样本）。kbd.py `mag R C DOWN UP [RT]` 已支持。

## 自定义 FN
```
-> 08 03 01 00 0000 02 01 03 00 …   SINGE_SET 键(2,1)=A, KEY_MODE=3 (FN)，无 DES 等参数 → CRC 0xeced9498
-> 08 03 02 00 0000 02 01 …         SINGE_RESET → CRC 0xd032dd47
```
推测印证：key_mode_t 3 = FN。注意这对 CRC 差分**不是**单个 mode 字节（KEY CRC 模型仍不完整，低优先级）。
kbd.py：`keyadv 2 1 3 0 0` 即可发出同样的包（未实测效果）。

## 设备回读：DRIVER_INIT (MASTER 0x00)（已解，2026-09-25）★ 网页驱动的状态来源
`-> 08 00 START` → 设备从段 START 开始，**按固定顺序**把后面各段全部流式上报，以段 0xfe 结束：
```
<- 08 00 SECTION ALL_PACK_CNT(u16) CUR_PACK(u16,从1起) LAST_PACK_SIZE DATA[12]
```
START=00 的顺序：00 START(4B) → 01 DEV(14) → 11 LIGHT_CFG(18) → 18 MAG_CAL(420) → c7 MAG_M1_CRC → c8 MAG_M2_CRC
→ c1 KEY_M1_CRC → c2 KEY_M2_CRC → 0d CBK_M1(220) → 06 MB(218) → 09 MC(106) → 07 MT(840) → fe END。
**键表/磁轴表不在 00 的序列里**，要单独从它们开始：`08 00 02` KEY_M1(4768) / `04` KEY_M2 / `19` MAG_M1(980) / `1a` MAG_M2，
之后同样接着流出后续段。`08 00 03` 只回 fe（空）。段号 = INIT_CMD 枚举。
- KEY_M1 = `full_key_prog_t`：crc_value(u32) all_step(u32) + 70 × **key_t 68B**（行优先）：
  mode, locked, media(index,data), layer(4B: layer_num…), mod(12B: type,key_row,key_col,ms_button,ms_x,ms_y,ms_wheel,mode,interval),
  prog(32B), dks(12B), snap(row,col), cancel(row,col)。实测默认 mod=(0, r+1, c)，印证键码规则。
- MAG_M1 = 70 × mag_key_cfg 14B（rt_on, nullA, head, down, up, fix_down, fix_up, bottom）。
- MT = **14 列 × 6 行，列优先，每键 10B**（偏移 (col*6+row)*10），前 6B = ACTIVE MODE A R G B；row5 未用。
- CRC 段 = 驱动上次写入的 CRC 原值（设备只存不算）；KEY_M1 表头 crc_value 同值。
- 设备 dump 的字节 CRC 与驱动 CRC 不直接相等（驱动按自己的 46B/23B 记录布局算）。
工具：`kbd.py dump [START_HEX]` → `dump/device/<段>_<名>.bin`。
其他尝试：MT ALL_DATA_START(08 08 07) 只回 64 个真实存在键的 (col,row) 列表、无灯数据、不改灯；
ALL_DATA_GET(08 08 08) 无响应。**空位**：(2,12) (4,3) (4,4) (4,5) (4,7) (4,8)。
**危险命令，勿发**：MASTER 0xcc FACTORY_RESET、0xdd IAP_MODE。

## 键码表 DES 第 0 行
物理数字行 (0,c) 临时改为 DES(0,c)：'2'→F1(Chrome 帮助)、'4'→F3(搜索)、'6'→F5(刷新)。
→ **DES(0,c) = F(c-1)**，(0,2..13)=F1..F12；(0,0)='~'、(0,1)=空（以 KEYMAP.md 为准）。DES 表 ≈ 全尺寸键盘矩阵：row0 Esc/F 行，row1 数字行 …
教训：
- **MMPanel 开着时会抢答**设备的 `00 c1` CRC 请求（自动发它的 CRC），并可能触发整表同步；测试前关掉 MMPanel。
- 当时 SINGE_RESET 对 1..8 未生效（读回 mod 仍是 DES(0,c)）；改用 **SINGE_SET 写回默认**
  `08 03 01 00 0000 R C 00 00 (R+1) C 00 00 00 00 00`（[16]MODE=0）后读回确认恢复。
- 读回 (`kbd.py dump 02`) 是验证改键状态的可靠方法。

## 键码表（已解，见 KEYMAP.md / keylist.json）
从 MMPanel 运行时内存提取 KeyList 全部静态表（打开改键页后 memdump.py，scratch/keylist_extract.py）：
KEY_CHAR_LIST[6,21] = DES 键码表（全尺寸布局：row0 Esc/F 行 …），VK_TO_INDEX（Windows VK→DES），PHY_KEY_LIST（64 个物理键），
MOUSE_CHAR_LIST，MEDIA_CHAR_LIST[2,8]，SCAN_VALUE_LIST（位掩码）。与实测一致：DES(0,2)=F1、(1,0)=Esc、(3,1)=A、(4,5)=B。

## 完整校准 + 保存
MMPanel 官方校准只发两条：`08 30 01` START → 设备上报 64 键（08 30 11 …）→ `08 30 02` **END(保存)**，END 无响应。
- 保存结果 = **MAG_CAL 段（DRIVER_INIT 0x18）**：70 × 6B `u16 0, u16 MIN, u16 REST`（按矩阵 r*14+c；空位默认 2000/2200）。
  MIN/REST 与校准过程中各键最后一次上报的值**逐一完全相同**（64 键全部核对）。
- **重新上电后回读才可见**：END 后立即 dump 仍是旧值；拔插后 64 键全部更新 → 写 flash，回读读的是开机时载入的副本。
- 灯效（MB 克莱因蓝、MT WASD 金色）断电后保留 → MB/MT 写入即持久化，无需额外保存命令。

## 按键层切换（15_layer，2026-09-25）
MMPanel 高级键页顶部的「层1 / 层2」图标 = DEV(0x02) 整包写 + LIGHT_CFG(0x11) 附带包，只有 **p[4] DEV.KEY_LAYER** 变化：
```
08 02 00 00 01 01 01 00 01 0a 01 05 00 00 00 00   层2 (KEY_LAYER=1)
08 02 00 00 00 01 01 01 00 01 0a 01 05 00 00 00   层1 (KEY_LAYER=0)
08 11 ff ff ff ff 00 01 01 01 00 01 ff 00 00 01 0a 07 08 50   (LIGHT_CFG 不变)
```
MAG_CFG_LAYER(p[13]) 不随之改变；KEY_LAYER(0x0c) 命令未使用（推测是设置"切层键"，界面无入口）。
DRIVER_INIT 读回的 DEV(01)/LIGHT_CFG(11) 段 = 写入包 p[2:]，可"读回-改字段-写回"（kbd.py devset / layer）。
**实测（kbd.py，2026-09-25）**：`layer 2` 后 Q 打出层2映射 w，`layer 1` 后打出 q ✔。
- **改键(KEY 0x03)总是写入当前激活层**：KEY_MEM(p[3])=1 仍写进 M1（当时激活层1）；切到层2后同一包写进 KEY_M2（DRIVER_INIT 段 04）。
- 设备随后请求的 CRC 也随层变化：层1 请求 `c1`（KEY_M1_CRC），层2 请求 `c2`（KEY_M2_CRC）。回错命令会写错层的 CRC → kbd.py 按请求回。
- KEY 表段(02/04, 4768B) 前 4 字节 = 存储的 CRC（LE），设备原样存驱动发来的值；`08 c1 00 <crc>` 可不经请求直接发送写入。
- Q(1,1) 改键影响表内偏移 1038(1→2)、1045(0→1)。
- 未解现象：层2 keyreset 回 c2 CRC 后，M1 段 CRC 也变成与 M2 相同（两表内容当时一致）。

## 媒体键 / 鼠标键改键（16_media + kbd.py 实测，2026-09-25）
KEY SINGE_SET（`08 03 01 00 00 00 ROW COL ...`）：
- **媒体键**：KEY_MODE[8]=2(MEDIA)，[9] MEIDA_BYTE = MEDIA_CHAR_LIST 行号(1 起)，[10] MEIDA_DATA = 该行**位掩码**，[11] UP_CLEAR=0，[16]=0。
  抓包 VOL_UP = `02 01 02`；实测 BYTE1 DATA 0x04 = VOL_DOWN ✔，BYTE2 DATA 0x02 = MAIN_PAGE(浏览器主页) ✔。
  行0: bit0 VOL_MUTE,1 VOL_UP,2 VOL_DOWN,3 COMPUTER,4 CALC,5 PLAY,6 PREV,7 NEXT；行1: bit1 MAIN_PAGE,2 WWW_BACK,3 WWW_FORWARD。
- **鼠标键**：KEY_MODE[8]=0，KEY_TYPE[9]=1(MOUSE)，[10] BUTTON 位掩码(1 L/2 R/4 M)，[11] X i16，[13] Y i16，[15] WHEEL i8，[16]=1。
  实测：BUTTON 2 = 右键 ✔；X=+20 点按右移 20（按住不连发）✔；WHEEL=-1 向下滚 ✔；Y 未测（推测 +Y 向下）。
- MMPanel 改键时不等设备请求，直接发 `08 c1 00 <crc>`。

## 禁用键（17_disable）
`08 03 01 00 00 00 ROW COL 10 00…` —— KEY_MODE=**0x10**（key_mode_t 中无此值），其余全 0；随后 `08 c1 00 <crc>`。实测 Q 无输出 ✔。kbd.py keydisable。

## 高级键页顶部预设（18_presets）
单包固件命令 `08 03 <PROG_CMD> 00…`，无按键参数，随后 `08 c1 00 <crc>`：
09 WASD_DKS_SET_ON（WASD 抬起急停） / 0b SNAP_TAB_SET_ON（AD 后覆盖/SOCD） / 0c AD_CANCEL_SET_ON（AD 抵消） / 0a WASD_DKS_SNAP_SET_OFF（WASD 恢复默认）。
PROG_CMD 其余：03 ALL_SET, 04 ALL_RESET（整层重置）, 05/06 ALL_DATA_START/GET, 07 APPLY_TO_ALL —— 未抓。kbd.py keypreset。

## kbd.py calibrate（完整校准，2026-09-25 实测 ✔）
START(08 30 01) → 按上报跟踪每键 REST-MIN ≥ 阈值即算"按到底" → 64 键齐后自动 END(08 30 02)；超时 CANCEL(08 30 03)。开始前备份 MAG_CAL 段到 dump/cal_backup_*.bin。
实测：93s 完成，拔插后 MAG_CAL 段 64/64 键更新（dump/cal_after_20260925.bin）。满行程 REST-MIN 843..978；A 仅 647（阈值 600 时浅按被放过）→ 阈值改 750。
MANUAL_CAL_RESET(4) 仍未测（推测恢复出厂校准值；会覆盖当前校准）。

## MB / MC 读回段布局（差分探测，2026-09-25）
- **MB (段 06, 218B)**：[0] 当前 MODE，[1] ?，[2..7] EQ 参数(? 05 SPEED1 SPEED2)；
  模式 m(2..22) 记录在 **10m-12**，10B：`DIR ? IS_CUSTOM R G B SPEED1(u16) SPEED2(u16)`（STREAM 写 SPEED2 不存）。
- **MC (段 09, 106B)**：[0] 当前 MODE，[1] ?，之后 13 × 8B 记录 `IS_CUSTOM R G B SPEED1(u16) SPEED2(u16)`，
  记录顺序：3 BREATH@2, 4 GRADIENT@10, 5 STREAM@18, 6 STAR@26, ?@34, ?@42, 7 NORMALLY@50, 之后 8..13（推测 @58+8k；@34/@42 推测为 1/2 APM）。
  STREAM 不存 RGB。
- **key_t 68B**（KEY_M1/M2 段，偏移 8+idx*68）：0 mode, 1 locked, 2 media.index, 3 media.data, 4..7 layer,
  8 mod.type, 9 mod.key_row, 10 mod.key_col, 11 ms_button, 12 ms_x(u16), 14 ms_y(u16), 16 ms_wheel, 17 mod.mode, 18 interval(u16),
  20..51 prog, 52..63 dks(type,row,col,btn,x,y,wheel,interval), 64 snap.row, 65 snap.col, 66 cancel.row, 67 cancel.col（Q 改键差分 +10/+17 印证 mod 偏移）。
- dev_cfg_t [12] 名为 fps_enhance（= DYN_SCAN）。
