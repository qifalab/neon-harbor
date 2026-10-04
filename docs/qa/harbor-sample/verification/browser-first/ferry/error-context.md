# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: harbor-sample.spec.js >> ferry: public boarding, physical upper-deck stairs, travel and lower-door alighting
- Location: tests/e2e/harbor-sample.spec.js:136:3

# Error details

```
Test timeout of 600000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic "霓港三维游戏画面" [active] [ref=e2]
  - main "游戏界面":
    - generic:
      - generic:
        - generic:
          - text: 霓港
          - generic: NEON HARBOR
        - generic:
          - text: 03 · 河口渡轮
          - generic: 19:48 · 晴
      - generic:
        - button "切换步行与跟随视角" [disabled] [ref=e3]: 步行视角
        - button "打开多人房间" [ref=e4] [cursor=pointer]: 多人
        - button "暂停游戏" [ref=e5] [cursor=pointer]: Ⅱ
    - complementary:
      - generic: 港湾公共交通 · 下层
      - heading "03 · 河口渡轮" [level=2]
      - paragraph: 下一站 河口北码头。WASD 在车内走动，Z 慢走，沿楼梯上下层；下车请返回下层车门，停靠时按 E。
      - generic:
        - button "委托中心 ↗" [ref=e6] [cursor=pointer]
        - button "城市导览 ↗" [ref=e7] [cursor=pointer]
        - button "港湾日常 ↗" [ref=e8] [cursor=pointer]
        - generic: 7 s
    - generic:
      - button "打开城市地图" [ref=e9] [cursor=pointer]:
        - generic [ref=e11]: "N"
        - generic [ref=e12]: ↗
      - generic:
        - generic: HP
        - generic: ST
    - generic:
      - generic: WASD
      - generic: 03 · 河口渡轮 · 可在车内走动，到站从下层车门下车
  - status
```