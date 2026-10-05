# South-085 方法修正记录

用户要求暂停后原样保存，未修复、未重跑。原方法误要求普通大厅 `renderVisibility.outdoor=false`，实际进楼成功但等待超时 exit1。已修正为检查真实 `south-085` 室内 owner、楼层、房间/碰撞体计数，并允许普通大厅保持 `renderVisibility.outdoor=true`；原失败仍保留在 `original-preparation-missing-bay-view/`。

原封存文件保留旧绝对路径和源码／构建绑定；需要修正大厅 guard、使用真正的 owner／外壳条件，并重新绑定实际 before／candidate 后再运行。目录内原 METHOD-SEAL 仅描述原文件，本说明不是原封存文件。不得将该方法或其存档视为美术通过。
