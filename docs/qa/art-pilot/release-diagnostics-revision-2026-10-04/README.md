# 同步释放诊断与方法修订（仅 CPU，待独立审查）

首轮原生结果仍为 FAILED；封存 archive-ledger SHA256 为 fb60ba35e31ca0b392aaa465823565ecab962c93173850dbf32f48144f160be1。旧方法 8be52d41 的全部字节、原断言、原 stdout/stderr/pose/PNG 和缺失 failure PNG 的证据缺口保持不变。这里属于之后获得授权的隔离修订，不改写首轮结论。

修改六份文件：src/main.js、src/city-exploration.js、src/metropolis-interiors.js、src/harbor-workshop-pilot.js、tools/capture-workshop-pilot.mjs、tests/harbor-workshop-pilot.test.js。city-exploration.js 是此前试点新增范围之外的只读 callback 转接，需单独审核。全部修改均在 detached isolated worktree，未写 ROOT、未启动 server/browser/GPU；dist 尚未重建，不应将旧 8f918 manifest 当作新版本通过。before/ 是修改前精确字节，revision.patch 是这六份文件的可审查差异，after-source-hashes.json 是修订后 SHA。

仅释放时通过 main → city → interiors → pilot 传只读 renderer.info.memory 的 geometry/texture 数字。每件 asset 在同一个同步调用栈复制 before、执行 dispose、复制 after，之间无 await、render、update、snapshot 或 GL 调用。读取异常和无效值被记录为 available=false/readErrors/null difference；实际释放仍执行。64 条有界事件只在加载/释放追加，snapshot 深克隆已有计数及错误，不读取新数据。不会调用 getError 或更改游戏/相机/时钟/存储。

normal 仍真实公开 Atlas 设置位置、High/native1280×800、E/房门/WASD/鼠标。warm 及随后三次访问各要求两个资产确实解码/渲染，然后分别同步释放：vice 4 geometry / 3 PBR + 1 bone texture、chest 7 geometry / 3 PBR；关闭各三张 ImageBitmap。任何诊断不可用、实际 delta 不符、未挂载或非零正常错误都必须失败。全局 street 对象计数仍每次保存、等待真实连续四样本稳定并记录与首个 baseline 的差值；不再将异步城市 LOD 对象缓存等同 owned pilot 资源，不据此宣称全城无泄漏或驱动显存回收。首次全局严格断言失败未被追认通过。

404 和 delay-exit 保持独立上下文与原网络控制。Fulfilled 但从未挂载/渲染的模型必须记录真实零 GPU delta 与正 CPU 资源释放；真实 abort 与实际 late-parse 按事件区分，未发生的 parse 不写成功。normal40min、各负场10min、总60min hard deadline、不重试以及地点设置标注均不变。

失败时先持久保存首个断言，再记录 snapshot 异常与 screenshot attempt 的开始/完成时间、原文件名、SHA或错误栈。scenario 只尝试一次截图；外层不会在已关闭上下文偷偷再拍，首个错误不被截图异常替换。

CPU 原始 targeted.stdout.txt/stderr/result 保存实际 9/9 通过，exit0；六份 Node --check 和 git diff --check 通过。新增两个回归使用明确标注的 CPU dispose-listener counter adapter 检验同步时序/冷路径与未上传零值，另以 callback throws 实际 GLB cleanup 验证 diagnostic 失败仍释放 11 geometry / 6 textures / 6 images、snapshot 错误深拷贝且不重读。它们不是 JPEG 浏览器解码或 GPU 释放证据。未重跑完整回归、未 build、未执行新的原生套件。
