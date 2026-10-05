# 港湾近树原创来源

三份CC0米制GLB服务于六个指定港湾街树站点，按80m加载、100m释放；High默认保留，其他街树仍沿用既有表现。

当前每变体1728片闭合折叶、22768三角、2网格/材质。原576叶、树皮及原纹理保持字节一致，新增1152片填冠内与中层；六站最坏136608三角/6次instanced绘制，三GLB共9580552字节。原稀疏候选及失败美术记录保留于QA。

可编辑配方为source/recipes.json，几何与导出源为source/author-trees.mjs，纹理源为source/make-original-tree-textures.py及三张原PNG。复现命令：`node art-source/sample-street-trees/source/author-trees.mjs`。资产许可见LICENSE.txt；生产清单assets/harbor/vegetation/asset-manifest.json记录来源SHA与实际GLB预算。

CPU确定生成、附根、包络与释放检查通过；艺术效果及真实GPU成本由最终High实拍另行验收。当前GLB不是扫描树，程序细节不代表AAA签收。
