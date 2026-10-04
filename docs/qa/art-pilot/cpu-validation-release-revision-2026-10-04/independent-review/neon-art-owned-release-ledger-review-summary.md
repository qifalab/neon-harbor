# release diagnostics revision ledger 只读复核

结果：新 revision ledger **14/14 exact**（278,876 字节）；六份 before/after 源文件和 before manifest 声明 **6/6 exact**。旧 native archive ledger 指定 SHA 与 **183/183 文件 exact**（35,077,584 字节）均通过。

新 ledger SHA256：`d5f8740a8777607ae6baa7ba6bd446e7d174fea3693b0c181ac8ffe58fcff497`。
旧 ledger SHA256：`fb60ba35e31ca0b392aaa465823565ecab962c93173850dbf32f48144f160be1`，与请求的封存值完全相等。两份清单逐文件缺失、字节数或 SHA 不一致均为 0。

| 文件 | before：字节 / SHA256 | after：字节 / SHA256 | 核验 |
| --- | --- | --- | --- |
| `src/main.js` | 53,004 / `a37f3ed780ca5a293c12c5e8ddc0a8b2b7fbfdfaef335557673899cfde0d0edf` | 53,113 / `9545b649258539de64d3a4c1a847c7be452468746a3d8a5e971008e66398aa5d` | exact |
| `src/city-exploration.js` | 22,049 / `e92f51b7bed5630c8b5b65419363e37cde8235f246aae25ce9f7696fd67a8c9c` | 22,089 / `4bcee64c1fd0141a62ce7ca09f5511b6f648ea518e44f0201a622f6b83ffa28f` | exact |
| `src/metropolis-interiors.js` | 108,560 / `290af1e550e027c6d73ff7bab33beeef5c7ee71a8940c0bf233b1554bd96f2e3` | 109,056 / `6eaa1f76be34c795b76bda6f95c7c04cabc78a80867159aa9a8a122dd9b33573` | exact |
| `src/harbor-workshop-pilot.js` | 13,149 / `6dd779c3a273bcc447ce829034dc37e53d720dac05e774fdc4852adec433bd32` | 14,598 / `0e46506ba9b84dba07a244c0912e0b463a5d44c3e2ea813a3d1cb6141613d6b7` | exact |
| `tools/capture-workshop-pilot.mjs` | 30,634 / `8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9` | 35,572 / `6bb5b9b574e22b2be5ebec977d3b4f1e56faab64e3ed11d5fb9ef47bc426f714` | exact |
| `tests/harbor-workshop-pilot.test.js` | 14,751 / `92ae3d6c66bf6a0d495ffaaed4a24d6ce3a1b456c279db58e26c0b56ed09acc9` | 20,471 / `b4adc2365169fcad911e91d8efc74bb36bd32d794f6f1d2e10b916c1f93dc4be` | exact |

方法：使用 Python pathlib.read_bytes 重算本地字节数及 hashlib.sha256；before 对照 revision 目录的 before 副本和 before-source-hashes；after 对照隔离工作树当前六份文件。旧 ledger 及183条存档文件由独立子任务按同一只读方法核验。未执行 GPU/browser/tests/build/远程请求，未修改仓库；所有新文件仅在 /tmp。

可审计产物：

- 新清单方法：`/tmp/neon-art-owned-release-ledger-review-revision.py`。
- 新清单与六文件逐条结果：`/tmp/neon-art-owned-release-ledger-review-revision.json`。
- 旧存档方法：`/tmp/neon-art-owned-release-ledger-review-old-archive.py`。
- 旧存档逐条结果：`/tmp/neon-art-owned-release-ledger-review-old-archive.json`。
- 旧存档结论：`/tmp/neon-art-owned-release-ledger-review-old-archive.md`。

此处只证明字节完整性与修订前后精确归属，不将新的 CPU 修订写成原生/GPU验收通过，也不更改旧轮 FAILED 结论。
