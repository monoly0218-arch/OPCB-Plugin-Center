# 字体与图像证据

Nunito：[Google Fonts源码](https://github.com/google/fonts/tree/main/ofl/nunito)，variable 200–1000，SIL OFL 1.1。Quicksand：[源码](https://github.com/google/fonts/tree/main/ofl/quicksand)，variable 300–700，SIL OFL 1.1。中文：[Resource Han Rounded](https://github.com/CyanoHao/Resource-Han-Rounded)，v0.990的CN Regular/Bold，SIL OFL 1.1；来源声明见该项目LICENSE.md。字体源文件和分发WOFF2哈希见fonts/MANIFEST.json。

英文子集涵盖基本拉丁、Latin扩展至U+024F与常用标点；中文子集由Python的GB2312字符集合生成，保留7447个映射。使用fontTools subset，保留layout features和可变字重；导出WOFF2。修改后的family/PostScript名使用OPCB前缀，原版权和授权记录保留。此子集不是全字符中文字体，罕见人名、扩展汉字依赖系统回退。

本机/System/Library/Fonts/SFNSRounded.ttf确有.SF NS Rounded字体；EGO中local('.SF NS Rounded')、local('.SFNSRounded-Regular')与local('SF Pro Rounded')均加载失败。ui-rounded实际渲染曾回退PingFangSC，而不是SF圆体。没有提取或分发该系统字体，不能凭CSS声明就声称使用原体。最终用浏览器CSS.getPlatformFontsForNode核对实际Nunito、Quicksand与中文子集，记录见验证附件。

数字以真实渲染字形和宽度检查为准；font-variant-numeric声明本身不证明字体支持tabular特性。标题粗细与字形仍需用户审阅，不能把功能测试当视觉等同证明。

立体图像：[Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)，MIT授权。来源与字节哈希在assets/MANIFEST.json，授权文件独立及内嵌HTML保留。它们是固定的清晰替代，不是已证实的Woday原始包。Sphere分类和控件几何由本轮编写；不再使用Unicode字符冒充图标。
