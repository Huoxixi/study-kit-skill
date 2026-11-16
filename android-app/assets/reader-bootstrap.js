;(function () {
  'use strict';
  // The only native request available to a document is a system Save As picker.
  // Imported documents never receive a general device or filesystem bridge.
  let exporting = false;
  window.__studyKitExport = async function (url, name) {
    if (exporting) return;
    exporting = true;
    try {
      const blob = await (await fetch(url)).blob();
      if (blob.size > 8 * 1024 * 1024) throw Error('导出文件超过 8 MB，请使用顶部“备份”。');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error('读取导出内容失败。'));
        reader.readAsDataURL(blob);
      });
      window.prompt('study-kit:save-download', JSON.stringify({name: name || '学习进度.json', type: blob.type || 'application/json', data}));
    } catch (error) { window.alert('导出未完成：' + error.message); }
    finally { exporting = false; }
  };
  // Generated progress downloads often click an anchor that was never attached to the DOM.
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^(blob:|data:)/.test(this.href)) {
      window.__studyKitExport(this.href, this.download);
      return;
    }
    return originalClick.apply(this, arguments);
  };
  document.addEventListener('click', function (event) {
    const anchor = event.target && event.target.closest && event.target.closest('a[download]');
    if (!anchor || !/^(blob:|data:)/.test(anchor.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__studyKitExport(anchor.href, anchor.download);
  }, true);
})();
