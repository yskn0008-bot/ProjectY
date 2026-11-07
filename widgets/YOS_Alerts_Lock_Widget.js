// YOS Alerts Lock Widget — privacy-first entry only.
// Display no alert titles, bodies, amounts, email subjects, or status counts.
// Tap opens the existing Notion YOS notification page, never the iOS Notification Center.
// Source data remains in existing Apple/Notion/YOS systems; this widget is not a new SSOT.
const NOTIFICATION_PAGE = "https://www.notion.so/3fa5ca88289581d399cece2fb6e87c2d";

const widget = new ListWidget();
widget.url = NOTIFICATION_PAGE;
widget.addAccessoryWidgetBackground = true;

const family = config.widgetFamily || "accessoryRectangular";
const bell = SFSymbol.named("bell.badge.fill");
if (family === "accessoryCircular") {
  bell.applyFont(Font.systemFont(23));
  const image = widget.addImage(bell.image);
  image.imageSize = new Size(23, 23);
  image.centerAlignImage();
} else if (family === "accessoryInline") {
  bell.applyFont(Font.systemFont(12));
  const image = widget.addImage(bell.image);
  image.imageSize = new Size(12, 12);
  widget.addText("YOS");
} else {
  const heading = widget.addText("YOS · 要対応");
  heading.font = Font.semiboldSystemFont(14);
  heading.lineLimit = 1;
  widget.addSpacer(3);
  const hint = widget.addText("タップして確認");
  hint.font = Font.systemFont(12);
  hint.lineLimit = 1;
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentAccessoryRectangular();
}
Script.complete();
