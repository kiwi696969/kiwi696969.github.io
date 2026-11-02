/* ==========================================================================
   Kiwi Blog · 背景眨眼层
   在 body 末尾注入一个与背景图完全等宽高比的舞台，里面放两眼的
   「闭眼纹理」和「真实眼睛」两层。眨眼动画全部由 custom.css 完成，
   这里只负责把元素放进页面。

   设计上的取舍：底图保持原图不动，眼睛是"盖"上去的，不是"挖"掉的。
   所以即使这个脚本没加载、或者浏览器禁用了动画，背景依然是一张完整的插画。
   ========================================================================== */
(function () {
  "use strict";

  var EYES = [
    { key: "e1", cls: "kiwi-e1" },
    { key: "e2", cls: "kiwi-e2" }
  ];

  function build() {
    if (document.querySelector(".kiwi-stage")) return;

    var stage = document.createElement("div");
    stage.className = "kiwi-stage";
    stage.setAttribute("aria-hidden", "true");

    for (var i = 0; i < EYES.length; i++) {
      var eye = EYES[i];

      // 底层：闭眼纹理
      var lid = document.createElement("div");
      lid.className = "kiwi-eye kiwi-lid " + eye.cls;

      // 上层：原图真实眼睛，眨眼时压扁淡出
      var orb = document.createElement("div");
      orb.className = "kiwi-eye kiwi-orb " + eye.cls;

      stage.appendChild(lid);
      stage.appendChild(orb);
    }

    document.body.appendChild(stage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
