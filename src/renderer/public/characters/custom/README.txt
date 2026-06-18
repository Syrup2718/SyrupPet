把你的角色圖放進這個資料夾，命名為  character.png

建議：
- 用「去背（透明背景）」的 PNG，桌面上才不會看到方形底。
- 直立、角色置中、底部對齊（站在地上的感覺最好）。
- 解析度建議至少 400x440 以上，太小會糊。
- 也支援 GIF（會自動播放動畫）：把檔名改成 character.gif，
  並把 manifest.json 裡的 "image" 改成 "character.gif"。

放好後執行  npm run dev  就會看到你的角色。
如果檔案不存在，程式會自動先用內建的 default SVG 角色（不會壞掉）。

想換成「多表情」版本，可把 manifest.json 的 "mode" 改成 "svg"，
並放 6 個檔：normal/happy/confused/angry/thinking/sleepy.svg
