const sqlite3 = require('sqlite3').verbose();
const {
  Builder, By, Key, until
} = require('selenium-webdriver');

function rundbshit(back) {
  var db = new sqlite3.Database('converted.bmpr');

  db.serialize(function() {
    db.run("CREATE TABLE THUMBNAILS (ID TEXT PRIMARY KEY, ATTRIBUTES TEXT)");

    db.run("CREATE TABLE BRANCHES (ID TEXT PRIMARY KEY, ATTRIBUTES TEXT)");

    var stmt = db.prepare("INSERT INTO BRANCHES VALUES (?, ?)");
    stmt.run('Master', JSON.stringify({
      "symbolLibraryID": "",
      "projectDescription": "",
      "branchDescription": "",
      "skinName": "sketch",
      "selectionColor": 9813234,
      "creationDate": +new Date(),
      "fontFace": "Balsamiq Sans",
      "fontSize": 13,
      "linkColor": 545684
    }));
    stmt.finalize();

    db.run("CREATE TABLE INFO (NAME TEXT PRIMARY KEY, VALUE TEXT)");
    let info = {
      SchemaVersion: 1.2,
      ArchiveRevision: 3456,
      ArchiveRevisionUUID: '7567825F-5C72-E156-5E20-EB1C5484E438',
      ArchiveFormat: 'bmpr',
      ArchiveAttributes: {
        name: "WFs",
        creationDate: +new Date()
      }
    };

    stmt = db.prepare("INSERT INTO INFO VALUES (?, ?)");
    for (var variable in info) {
      if (info.hasOwnProperty(variable)) {
        stmt.run(variable, JSON.stringify(info[variable]));
      }
    }
    stmt.finalize();
    db.run(
      "CREATE TABLE RESOURCES (ID TEXT, BRANCHID TEXT, ATTRIBUTES TEXT, DATA TEXT, PRIMARY KEY (ID, BRANCHID), FOREIGN KEY (BRANCHID) REFERENCES BRANCHES(ID))"
    );
    back(db);
  });

  db.close();
}

const {
  realpathSync, readFileSync
} = require('fs');

var activeElementId = 0;
var pageThumbnailId = 0;
var elementMap = Object.create(null);

async function g_control(element) {
  var cls = await element.getAttribute('class');
  if (cls === null || cls.length == 0)
    return null;
  cls = cls.split(' ');
  if (cls.includes('box'))
    return 'box';
  if (cls.includes('combobox') || cls.includes('combobox2'))
    return 'combo';
  if (cls.includes('roundbox'))
    return 'button';
  if (cls.includes('textinput2'))
    return 'TextInput';
  if (cls.includes('headtext'))
    return 'TextBlock';
  if (cls.includes('page'))
    return 'webpage';
  if (cls.includes('groupmember'))
    return null;
  if (cls.includes('scrollv'))
    return 'vert-scroll';
  if (cls.includes('annotate'))
    return 'annotation';
  if (cls.includes('listcont'))
    return 'list';
  if (cls.includes('headline'))
    return 'headline';
  console.error(
    `[${new Date().toLocaleTimeString('it-IT')}] [WARNING] [ControlType::Match] No matching control type found for class list ${cls}`
  );
  return null;
}

function highlight_tick(driver, element) {
  driver.executeScript(
    `let el=arguments[0]; let old = el.style.backgroundColor; el.style.backgroundColor = "#FDFF47"; setTimeout(function () { el.style.backgroundColor=old; }, 80);`,
    element);
}

var initialRoot = null;
var initialRootId = null;

async function labelof(driver, element) {
  if (initialRoot === null)
    return [];
  var overlapping = await driver.executeScript(
    'return labelof(arguments[0], arguments[1])',
    initialRoot, element);
  console.error(
    `[${new Date().toLocaleTimeString('it-IT')}] [INFO] [ElementCompiler::CompileControl::Button::LabelOf] resolved to ${overlapping}`
  );

  if (overlapping.length == 1)
    return overlapping[0];
  else if (overlapping.length == 0)
    return null;
  else {
    console.error(
      `[${new Date().toLocaleTimeString('it-IT')}] [WARNING] [ElementCompiler::OverlappingElements] Several (${overlapping.length}) overlapping elements found, selecting first`
    );
    return overlapping[0];
  }
}

async function getRect(element) {
  var rect = await element.getRect();
  if (rect.x === undefined || rect.y === undefined)
    return rect; // meh
  if (rect.w && rect.h)
    return rect;
  var wh = await element.getDriver().executeScript(
    'return [arguments[0].clientWidth, arguments[0].clientHeight];',
    element);
  return {
    x: rect.x,
    y: rect.y,
    w: wh[0],
    h: wh[1]
  };
}

async function traverse_children(driver, element, obj, parent, insert) {
  let children = await element.findElements(By.xpath('*'));
  for (var child of children) {
    await reverse_dfs(driver, child, parent ? parent : obj, insert);
  }
  if (parent !== null)
    parent.children.push(obj);
}

async function fix_styles(obj, element) {
  var cls = await element.getAttribute('class');
  if (cls === null || cls.length == 0)
    return;
  cls = cls.split(' ');
  if (cls.includes('ql-align-center'))
    obj.properties['align'] = 'center';
  if (cls.includes('ql-align-right'))
    obj.properties['align'] = 'right';
  if (cls.includes('ql-align-left'))
    obj.properties['align'] = 'left';
}

async function reverse_dfs(driver, element, parent, insert) {
  var obj = Object.create(null);
  highlight_tick(driver, element);
  var id = await element.getId();
  if (elementMap[id])
    return elementMap[id];
  elementMap[id] = obj;
  let {
    x, y, w, h
  } = await getRect(element);
  console.error(
    `[${new Date().toLocaleTimeString('it-IT')}] [INFO] [ElementCompiler::DiscoverElement] Element ${id} is at {x: ${x}, y: ${y}, w: ${w}, h: ${h}}`
  );
  var type = await element.getTagName();
  if (type != 'div' && (!w || !h)) {
    // not visible
    console.error(
      `[${new Date().toLocaleTimeString('it-IT')}] [ERROR] [ElementCompiler] Element ${id}(${type}) has no width (${w}) or no height (${h})`
    );
    // return undefined;
  }
  obj['controls'] = {
    control: []
  };
  obj.children = [];
  obj['ID'] = activeElementId++;
  obj['w'] = w;
  obj['h'] = h;
  obj['x'] = x;
  obj['y'] = y;
  obj['measuredH'] = h;
  obj['measuredW'] = w;
  obj['zOrder'] = +await driver.executeScript(
    'return arguments[0].style.zIndex', element);
  obj['properties'] = Object.create(null);

  switch (type) {
    // the Unhandled
    case 'line':
      console.error(
        `[${new Date().toLocaleTimeString('it-IT')}] [WARNING] [ControlType] Ignoring Element ${g}`
      );
      break;
    case 'svg':
      console.error(
        `[${new Date().toLocaleTimeString('it-IT')}] [INFO] [ControlType] Started rendering an SVG`
      );
      var img = await driver.executeScript(
        'return window.prerender_svg(arguments[0])', element);
      var data = null;
      while (data === null) {
        data = await driver.executeScript(
          'return window.render_svg(arguments[0])', img);
      }
      console.error(
        `[${new Date().toLocaleTimeString('it-IT')}] [INFO] [ControlType] Finished rendering an SVG: ${data.slice(0,30)}...`
      );
      var imgID = activeElementId++;
      var insertion = [{
        name: `drawing${imgID}`,
        thumbnailID: pageThumbnailId++,
        order: 926494.1048855776,
        importedFrom: "",
        trashed: false,
        kind: "otherAsset",
        mimeType: "base64/png",
        creationDate: 0,
        notes: null
      }, data, imgID];
      insert.push(insertion);
      obj['typeID'] = 'Image';
      obj.properties['src'] = {
        Anchor: -1,
        ID: imgID
      };
      parent.controls.control.push(obj);
      break;
    case 'i':
      obj.properties['italic'] = true;
    case 'b':
      obj.properties['bold'] = true;
    case 'u':
      obj.properties['underline'] = true;
    case 'p':
      obj['typeID'] = 'Paragraph';
      obj.properties['text'] = await element.getText();
      await fix_styles(obj, element);
      if (parent !== null && obj.properties.text !== '')
        parent.controls.control.push(obj);
      break;
    default:
      console.error(
        `[${new Date().toLocaleTimeString('it-IT')}] [ERROR] [INTERNAL] [ElementCompiler] Unhandled element type ${type}, treating as a group`
      );
    case 'div':
    case 'span':
      var g;
      if ((g = await g_control(element)) !== null) {
        // we have a special element
        switch (g) {
          case 'box':
            obj['typeID'] = 'Canvas';
            for (let el of await element.findElements(By.xpath('*')))
              await reverse_dfs(driver, el, obj, insert);
            parent.controls.control.push(obj);
            break;
          case 'button':
            obj['typeID'] = 'Button';
            var text = await labelof(driver, element);
            if (text) {
              obj.properties['text'] = await text.getText();
              elementMap[await text.getId()] = {};
            } else {
              console.error(
                `[${new Date().toLocaleTimeString('it-IT')}] [ERROR] [FORM] [ElementCompiler::CompileControl::Button] no <p> element over this button ${element} to serve as a name: got some ${text}`
              );
            }
            parent.controls.control.push(obj);
            break;
          case 'combo':
            obj['typeID'] = 'ComboBox';
            parent.controls.control.push(obj);
            break;
          case 'TextInput':
            obj['typeID'] = 'TextInput';
            parent.controls.control.push(obj);
            break;
          case 'TextBlock':
            obj['typeID'] = 'BlockOfText';
            parent.controls.control.push(obj);
            break;
          case 'webpage':
            obj['typeID'] = 'BrowserWindow';
            obj.properties['text'] =
              `https://some.site/page?id=${initialRootId}`;
            if (parent)
              console.error(
                `[${new Date().toLocaleTimeString('it-IT')}] [ERROR] [ElementCompiler::CompileControl::WebBrowser] This webpage ${initialRootId} is inside another? parent = ${parent}`
              );
            await traverse_children(driver, element, obj, parent, insert);
            break;
          case 'TextArea':
            obj['typeID'] = 'TextArea';
            parent.controls.control.push(obj);
            break;
          case 'list':
            var ul = await element.findElements(By.tagName('li'));
            var text = '';
            for (li of ul) {
              text += (await li.getAttribute('textContent')).replace('\n', '-') +
                '\n';
            }
            obj.typeID = 'List';
            obj.properties['text'] = text;
            obj.properties['verticalScrollbar'] = false;
            obj.properties['hasHeader'] = false;
            parent.controls.control.push(obj);
            break;
          case 'annotation':
            // get an annotation replacement
            // HCurly over the annotation
            // VCurly to the right of the annotation
            var vcurly = JSON.parse(JSON.stringify(obj));
            vcurly.ID = activeElementId++;
            vcurly.typeID = 'VCurly';
            vcurly.x += vcurly.w;
            var text = await element.findElement(By.css(
              'span>div')).getAttribute('textContent');
            vcurly.w = 400; // TODO
            vcurly.properties['text'] = text || "-annotation-";

            var hcurly = JSON.parse(JSON.stringify(obj));
            hcurly.ID = activeElementId++;
            hcurly.typeID = 'HCurly';
            hcurly.properties['text'] = ' ';
            hcurly.properties['direction'] = 'top';
            hcurly.y += hcurly.h;
            hcurly.h = 20;

            parent.controls.control.push(vcurly);
            parent.controls.control.push(hcurly);

            // go inside
            obj['typeID'] = '__annotation__';
            obj['_original_tag'] = type;
            obj['_original_classlist'] = await element.getAttribute('class');
            await traverse_children(driver, element, obj, parent, insert);
            break;
          case 'headline':
            obj['typeID'] = 'BlockOfText';
            parent.controls.control.push(obj);
            break;
          default:
            console.error(
              `[${new Date().toLocaleTimeString('it-IT')}] [ERROR] [ControlType] Unknown element control type ${g}`
            );
            break;
        }
      } else {
        obj['typeID'] = '__group__';
        obj['_original_tag'] = type;
        obj['_original_classlist'] = await element.getAttribute('class');
        await traverse_children(driver, element, obj, parent, insert);
      }
      break;
  }
  if (obj.controls.control.length == 0)
    delete obj.controls;
  if (obj.children.length == 0)
    delete obj.children;
  if (Object.keys(obj.properties).length == 0)
    delete obj.properties;
  return obj;
}

(async function() {
  let driver = await new Builder().forBrowser('chrome').build();
  // get all frame in view
  await driver.manage().window().maximize();
  try {
    await driver.get('https://wireframe.cc/pro/pp/1cd90af25214280');
    driver.executeScript(
      `
      window.is_overlapping = function(div1, div2) {
        let $div1 = jQuery(div1);
        let $div2 = jQuery(div2);
        // Div 1 data
        var d1_offset = $div1.offset();
        var d1_height = $div1.outerHeight(true);
        var d1_width = $div1.outerWidth(true);
        var d1_distance_from_top = d1_offset.top + d1_height;
        var d1_distance_from_left = d1_offset.left + d1_width;

        // Div 2 data
        var d2_offset = $div2.offset();
        var d2_height = $div2.outerHeight(true);
        var d2_width = $div2.outerWidth(true);
        var d2_distance_from_top = d2_offset.top + d2_height;
        var d2_distance_from_left = d2_offset.left + d2_width;

        var not_colliding = (d1_distance_from_top < d2_offset.top || d1_offset.top >
          d2_distance_from_top || d1_distance_from_left < d2_offset.left ||
          d1_offset.left > d2_distance_from_left);

        // Return whether it IS colliding
        return !not_colliding;
      }
      window.filter = function(xs, pred) {
        var res = []
        for (var x of xs) if (pred(x)) res.push(x);
        return res;
      }
      window.labelof = function(sel, butt) {
        xs = sel.querySelectorAll('p');
        console.log("These are the <p>s", xs, "over this element", butt, "?");
        var res = filter(xs, function(x) {return is_overlapping(x, butt);});
        console.log(res);
        console.log('=====================================');
        return res;
      }
      window.prerender_svg = function(svg) {
        var svgData = new XMLSerializer().serializeToString( svg );

        var img = document.createElement( "img" );
        img.setAttribute( "src", "data:image/svg+xml;base64," + btoa( svgData ) );
        img.style.visibility='hidden';
        document.body.appendChild(img);
        return img;
      }
      window.render_svg = function(img) {
        if(!img.complete) {
            return null;
        }
        var canvas = document.createElement( "canvas" );
        var ctx = canvas.getContext( "2d" );
        ctx.drawImage( img, 0, 0 );
        img.remove();
        return canvas.toDataURL( "image/png" );
      }`
    );
    if (process.argv.includes('--skip'))
      return;
    var sitemap_b0 = await driver.findElement(By.xpath(
      '//*[@id="top"]/span[3]/div'));
    var sitemap_b1 = null;
    await sitemap_b0.click();
    let sitemap = await driver.findElement(By.id('sitemaplist')).findElements(
      By.tagName('li'));
    var insert = [];
    for (let element of sitemap) {
      let pageid = await element.getAttribute('data-pageid');
      console.error(
        `[${new Date().toLocaleTimeString('it-IT')}] [INFO] [Toplevel] Processing page ${pageid}`
      );
      if (process.argv.includes('--pages') && !process.argv.includes(pageid))
        continue;
      await element.click();
      if (sitemap_b1 === null)
        sitemap_b1 = await driver.findElement(By.xpath(
          '//*[@id="top"]/span[3]/div'));
      // await sitemap_b1.click();
      /*
      Do fun stuff with the current page
      */
      var e_rect = await getRect(element);
      initialRoot = await driver.findElement(By.id(pageid));
      initialRootId = pageid;
      var insertion = [{
        name: await element.getText(),
        thumbnailID: pageThumbnailId++,
        order: 926494.1048855776,
        importedFrom: "",
        trashed: false,
        kind: "mockup",
        mimeType: "text/vnd.balsamiq.bmml",
        creationDate: 0,
        notes: null
      }, {
        version: '1.0',
        measuredH: e_rect.h,
        measuredW: e_rect.w,
        mockupH: e_rect.h,
        mockupW: e_rect.w,
        mockup: await reverse_dfs(driver, initialRoot, null, insert)
      }, activeElementId++];
      insert.push(insertion);
    }
    rundbshit(function(db) {
      let stmt = db.prepare(
        'INSERT INTO RESOURCES VALUES (?, ?, ?, ?)');
      for (let iv of insert)
        stmt.run(iv[2], 'Master', JSON.stringify(iv[0]), JSON
          .stringify(iv[1]));
      stmt.finalize();
    });
    // console.log(JSON.stringify(insert));
    // await driver.wait(until.titleIs('webdriver - Google Search'), 5000);
  } finally {
    if (!process.argv.includes('--stay'))
      await driver.quit();
  }
})();
