# 浏览器回归测试

`browser-regression.cjs` 用合成图片在 Chromium 中验证 7 项 P1 修复和合并后的导出流程，包括实际 ZIP 解包、输出尺寸/像素比较、同名文件、处理期间锁定、加载竞态以及损坏图片和编码失败。测试自启临时 Vite 服务，结束时关闭服务和浏览器，不访问或部署线上网站。

运行环境需要已有 Playwright 和兼容的 Chromium。本次使用了机器上已有运行时，没有安装依赖或浏览器。若项目中可以直接解析 `playwright`，执行：

```sh
npm run test:browser
```

使用其他位置的已有运行时，可指定以下环境变量（路径换成本机实际位置）：

```sh
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
npm run test:browser
```

测试默认把结果、下载的 ZIP 和截图写入系统临时目录，也可用 `TEST_ARTIFACT_DIR` 指定输出目录。结果文件为 `results.json`，失败时返回非零退出码。

生产包冒烟检查需要先构建。为避免改动本仓库已跟踪的 `dist`，使用仓库外目录：

```sh
npm run build -- --outDir /tmp/image-watermark-test-build --emptyOutDir
```

保留上面的 Playwright 环境变量，再运行：

```sh
TEST_BUILD_DIR=/tmp/image-watermark-test-build npm run test:browser -- --production
```

默认回归有 12 个用例，生产包另有 1 个用例。Google Fonts 请求被测试拦截以排除外部网络不稳定；字体使用系统回退。像素比较允许不同分辨率绘制时正常的抗锯齿误差。当前没有宣称 Safari、Firefox、真实手机或百张高像素图片已经验收。
