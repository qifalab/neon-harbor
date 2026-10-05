# 限定 native-only 重拍入口（隔离候选，未采用/运行）

目标：对后续仅改摄影/步行/清理方法的实际失败组进行一次新捕获，不重复12项功能CI；当前cc038的24项原捕获继续，不取消、不改结果。最终Pages仍保留原12项功能门禁。生产源码、tests、assets与192项运行字典不由此包修改。

## 文件与采用范围

主payload仅3件：

- `.github/workflows/native-art.yml`：新增输入与5分钟只读selection job；capture全部steps原字节相同。
- `tools/native-review/select-native-cases.py`：严格输入/checkout验证，无capture/构建/游戏测试/GPU/refs写入。
- `tools/native-review/native-matrix.json`：原24行矩阵的完整JSON副本，原顺序、job timeout、High/Low label逐行完全相等。

`bridge/.github/workflows/ci.yml` 是独立最小入口补丁，**不是第二条功能发布门**。其原 verify/MP job steps和PR-only完整job保持不变，verify/MP只新增显式native-only时跳过的job条件。其余原capture步骤、run-paired-native.py、cases.json、既有71项bundle pins、默认24矩阵、max-parallel12、fail-fast:false、原方法预算/路线/guard/owned PID/startTick/pidfd/port闭合与首错/次错逻辑不变。

所有候选在此目录；ROOT、HEAD/index、refs、当前运行及原证据未改。60项纯选择器检查+Python AST/YAML/bash -n通过，另有5个字节/默认值静态核点；没有实际GitHub schema/run graph通过声明。

## 真实入口限制及两条调用路线

现有native-art文件已有workflow_dispatch，但GitHub只读 `GET repos/qifalab/neon-harbor/actions/workflows/native-art.yml` 当前返回404。仅在feature改该文件不能保证立即直接手动dispatch；本包不向main添加bootstrap。

A. 若新的default已注册该workflow，直接native入口即可，严格选组输入例：

```python
payload = {'ref': 'EXACT_REVIEWED_METHOD_BRANCH',
           'inputs': {'selected_case_ids': 'home,workshop,resident-core,bus,waterfront-day'}}
# json.dump到新文件或subprocess.run(['gh','api','--method','POST',
# 'repos/qifalab/neon-harbor/actions/workflows/native-art.yml/dispatches','--input','-'],
# input=json.dumps(payload),text=True,...)
```

B. 当前可使用已注册ci.yml桥接。主桥接的workflow_dispatch/native_only默认false、selected_case_ids默认all，workflow_call也是false/all；普通manualCI仍是原12功能+默认24 native，Pages/reusable仍原12功能、capture_native默认false。仅native_only明确true才跳过verify/MP，并强制进入native callee（避免capture_native=false导致空的成功CI）。选择器验证不通过时select job失败，capture依赖select所以不会启动。

```python
payload = {'ref': 'EXACT_REVIEWED_METHOD_BRANCH', 'inputs': {
    'native_only': 'true', 'selected_case_ids': 'home,workshop,resident-core,bus,waterfront-day'}}
# POST到已有 repos/qifalab/neon-harbor/actions/workflows/ci.yml/dispatches，structured JSON。
```

GitHub是否接受新增feature输入必须来自该次真实API返回/退出码和run graph，不由此源审断言。若默认分支输入校验不识别新flag，不循环尝试；保留首次失败，用下面的**无inputs专用feature profile**路线，不需要main bootstrap。

## 无inputs兼容profile（单独二选一CI文件）

`prepare-no-input-ci-profile.py`只在本隔离目录输出文件，拒绝ROOT/外部输出路径；它复用严格selector校验IDs，再仅更改主桥接workflow_dispatch中的两项默认值：native_only=true，以及具体canonical失败组CSV。workflow_call默认false/all、所有jobs字节保持与主桥接相同，native-art默认仍24/all。

已准备当前已报告失败组样例：

- `ci-no-input-current-failed-group.yml`
- `ci-no-input-profile-current-failed-group.patch`
- 选组：home、workshop、resident-core、bus、waterfront-day。

这是入口示例，**不表示这些方法校正已完成或可以签收**。最后源owner闭合哪些方法，就用其实际失败ID重新生成新的unique profile，不扩大或重试旧case：

```sh
python /tmp/neon-selective-native-recapture-workflow-20261005/prepare-no-input-ci-profile.py \
  --selected-case-ids home,workshop,resident-core,bus,waterfront-day \
  --output /tmp/neon-selective-native-recapture-workflow-20261005/ci-no-input-reviewed-group-v2.yml
```

在专用重拍worktree/feature采纳该profile作为ci.yml（与主bridge文件二选一，不能把两patch叠加），完成seal/commit/object上传/feature更新后，仅向**已注册ci.yml**发送无inputs的JSON：

```python
payload = {'ref': 'EXACT_REVIEWED_NATIVE_RECAPTURE_BRANCH'}
# POST repos/qifalab/neon-harbor/actions/workflows/ci.yml/dispatches --input structured JSON。
```

这是既有feature默认输入方法的延伸，实际无输入native_only activation仍须新run/head/attempt/graph证明。该profile明确是重拍分支的调用设置；若最终发布分支要恢复通常manualCI默认，则采纳主bridge的false/all设置，并在最终seal中记录实际CI文件。Pages调用/主干push条件始终不因profile而跳过功能。

## 严格选组和证据边界

- `all`必须为精确小写token，默认返回原24行完整矩阵。
- CSV仅允许cases.json中现有IDs；tokens可trim外围空白。拒绝空串/全空白/空token、未知ID、大小写变体、重复（包括trim后重复）和空集合。
- 请求不同顺序也按原矩阵canonical顺序输出；所有row字段从原完整矩阵读取，用户输入不进入shell/表达式，也不能修改timeout/label/route。
- 校验cases及matrix各24唯一ID/set完全相等，job timeout必须等于既有case值；新增/删case或budget漂移会失败，需独立review更新policy。
- selector checkout `github.sha`，其实际Git HEAD和Git root必须一致。后续原runner再验证authored actualHEAD、固定baseline、完整curated seal、实际workflow SHA、expected192 runtime dictionary与前后freeze。
- Selection只生成 `VALIDATED_SELECTION_NOT_CAPTURE_ACCEPTANCE`；它不是capture/art PASS。无效选择原错误记录在selection receipt，capture job不会运行。
- 新selection artifact名称带runId/attempt，capture artifact仍保持原case/run/attempt唯一名称与always上传。新case evidence目录不重用旧目录。
- 原cc038和其他历史firstFailure/partial/FAIL不可改；新方法新HEAD只产生新的实际结果。Low仍仅功能，High原图仍待人工审核；不把旧成功换算成新全套PASS。

## 必需seal刷新（后续独立worktree，不在本次执行）

本包不预造未来bundle-manifest SHA。现有runner会拒绝陈旧workflow/hash；因此采纳新helper/policy和所选CI文件后，source owner必须保留原71项已有pins（方法校正另有各自seal），加入helper/policy这两项真实bytes/SHA，并更新实际nativeWorkflowSha256/ciWorkflowSha256。Pages unchangedPagesSha256必须仍等于旧值。该包本身不更改原71件文件或expected-runtime dictionary。

方法候选采纳完成后，完整catalog只hash实际内容，不复制旧“passed”字样。不执行新的产品测试/build/GPU来证明本选组工具；其必要CPU检查只涉及选择、输出、workflow syntax和字节保持。

## 真实dispatch后核点

实际run event=workflow_dispatch，head_sha为新方法commit；selector success且其selectedCaseIds精确；只这些capture jobs展开；verify11/multiplayer明确skip因为native-only；PR-only按原条件skip。current24原run不被cancel或替换。capture每项仍独立VM、实际固定baseline与authored source、相同guard/预算/owned闭合。任一首错/cleanup失败仍FAIL；新run的有效图片/视频只属于它自己的SHA和方法。

最后发布仍经原Pages verify→deploy→live资源核验。仅native重拍不能授权绕过Pages或宣称功能回归整轮通过。
