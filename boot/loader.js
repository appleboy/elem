(function() {
  var elem = window.elem = {};

  /**
   * Root directory of all elements 
   */
  var root = new Dir('/');

  elem.root = root;
  
  /**
   * Environment - "production" or "development"
   */
  var env = 'development';

  function basedir(filename) {
    return filename.split('/').slice(0,-1).join('/') + '/'
  }

  function ppcss(css, filename) {
    if(env == 'development') {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = filename;
      document.head.appendChild(link);
    }
    else {
      var dir = basedir(filename);
      css = css.replace(/(@import\s*['"]?)([^/|.+?\/\/])/g, '$1'+dir+'$2')
      css = css.replace(/(url\(['"]?)([^/|.+?\/\/])/g, '$1'+dir+'$2')
      var style = document.createElement('style');
      style.innerHTML = css;
      document.head.appendChild(style);
    }

    return css;
  }

  function pphtml(html) {

    var dir = html.parent;

    html.data = '<!-- '+html.path+' -->\n' + html.data;

    if(!(dir instanceof Dir)) return html.data;

    return html.data.replace(/\.\//m, dir.path)


    return html.data;
  }

  function ppjade(name, src) {
    all[name].jade = src;
  }

  function attr2json(el) {
    var result = {};
    // var nodes=[], values=[];
    for (var attr, i=0, attrs=el.attributes, l=attrs.length; i<l; i++){
        attr = attrs.item(i)
        result[attr.nodeName] = attr.nodeValue;
        // nodes.push(attr.nodeName);
        // values.push(attr.nodeValue);
    }
    return result;
  }

  /**
   * Apply self-named resources to an element.
   * 
   * e.g. Within directory page/, applies page.js if present 
   *
   * If Javascript is found it is used to fill out an "exports" object on the directory. 
   * If HTML is found it is used as the innerHTML ONLY if there is there are no existing children.
   * If CSS is found it is linked to the document head. 
   *
   * @param {DOMElement} The target element to enhance 
   * @param {Dir} dir Custom element directory
   * @param {Function} done Callback 
   */

  function enhance(elem, dir, done) {
    if(elem.__elem_enhanced) {
      return;
    }

    elem.__elem_enhanced = dir;

    function implDone(html) {
      console.log('done', dir.path);
      if(html) {
        html = '<!-- generated by '+dir.path+' -->\n' + html;
        elem.innerHTML = html;
      }
      else {
        // html = html || require(dir.path,'html');
        // if(html) {
        //   elem.innerHTML = html;
        // }
      }

      unfreeze(elem);

      // Re-scan this element against
      // ancestor directories
      // The impl could have introduced
      // new matchable elements.
      var node = elem;
      var queue = [];
      while(node) {
        var pdir = node.__elem_enhanced;
        if(pdir) {
          queue.push(node);
          scan(elem, pdir, true);
        }
        node = node.parentElement;
      }
    }


    var html = require(dir.path,'html');
    if(html) {
      elem.innerHTML = html;
    }

    var impl = require(dir.path,'js');
    if(impl) {
      var fileData = dir.getData();

      if(typeof impl === 'function') {
        if(impl.length < 2) {
          impl.call(elem, fileData); 
          implDone();
        }
        else {
          impl.call(elem, fileData, function(err,html) {
            implDone(err,html);
          }); 
        }
      }
      else {
        implDone();
      }
    }
    else {
      implDone();
    }
  }

  /**
   * Searches a base element for instances of custom elements,
   * loads the resources, and then calls enhance().
   * 
   * @param {DOMElement} base The root element to search within
   * @param {Dir} dir Custom element directory
   * @param {Function} done Callback 
   */

  function scan(base, dir) {
    var uses = dir.findAll(base);

    // IT IS VERY IMPORTANT
    // THAT USES BE SORTED
    // BY DOCUMENT LEVEL
    // FOR FREEZING TO WORK
    // (sibling order is not important)
    uses = uses.sort(function(a,b) {
      return a.compareDocumentPosition(b)
    });

    each(uses, function(elem) {
      if(isFrozen(elem)) return;
      freeze(elem);

      var tagName = elem.tagName.toLowerCase();
      var path = [];

      var tmp = dir;
      while(tmp) {
        if(tmp[tagName]) {
          path.unshift(tmp[tagName]);
        }
        tmp = tmp.parent;
      }

      // Must load all first an enhance in order
      parallel(path, function() {
        each(path, function(dir) {
          enhance(elem, dir);
        });
      });
    });
  }


  /**
   * A simple XMLHttpRequest GET.
   *
   * @param {String} url URL to fetch 
   * @param {Function} done Callback 
   */
  function ajax(url,done) {
    var xmlhttp;

    if(window.XMLHttpRequest) {
      xmlhttp = new XMLHttpRequest(); // Browsers
    }
    else {
      xmlhttp = new ActiveXObject("Microsoft.XMLHTTP"); // IE
    }

    xmlhttp.onreadystatechange = function() {
      if(xmlhttp.readyState == 4
      && xmlhttp.status == 200) {
        done(null, xmlhttp.responseText)
      }
    }

    xmlhttp.open("GET", url, true);
    xmlhttp.send();
  }

  /**
   *
   */
  function get(path,done) {
    return ajax(root.path+path, done);
  }


  /**
   * Load the index with AJAX.
   *
   * @param {Function} done Callback 
   */
  function loadIndex(done) {
    get('_build/index.json', function(err, data) {
      if(err) {
        console.error('Elem build index not found. Did you build it?');
        return;
      }

      data = JSON.parse(data);
      parseIndex(data);
      done();
    });

  }

  function select(base, tags) {
    var elems = [];
    each(tags, function(tag) {
      var all = base.getElementsByTagName(tag);
      for(var i=0,l=all.length; i < l; ++i) {
        elems.push(all[i]);
      }
    });
    return elems;
  }


  /**
   * Freeze an element and all of its descendents
   * All descendents of frozen elements are ignored by scan()
   *
   * @param {DOMElement}
   */
  function freeze(elem) {
    elem.__frozen = true;
  }

  /**
   * Unfreeze an element
   *
   * @param {DOMElement}
   */
  function unfreeze(elem) {
    elem.__frozen = false;
  }

  /**
   * Test if any ancestors is frozen
   *
   * @param {DOMElement}
   */
  function isFrozen(elem) {
    while(elem) {
      if(elem.__frozen) return true;
      elem = elem.parentElement;
    }

    return false;
  }

  /**
   * Simple parallel processor.
   */
  function parallel(objs, done) {
    var count = objs.length;

    if(objs.length === 0) done();

    each(objs, function(obj) {
      obj.load(function() {
        if(--count == 0) {
          done();
        }
      });
    });
  }

  /**
   * Dir
   *
   * A local mapping of a server-side directory.
   *
   * @param {Dir} parent Parent directory object
   * @param {String} path path of the directory
   */
  function Dir(path, parent) {
    this.parent = parent;
    this.path = path;
    this.availTags = [];
    this.observers = [];
  }

  Dir.prototype.findAll = function(base) {
    var tags = this.availTags;

    if(this.parent) {
      tags = tags.concat(this.parent.availTags);
    }

    return select(base, tags);
  };

  /**
   * Collect all data from files recursively
   */
  Dir.prototype.getData = function(){
    var data = {};
    for(var k in this) {
      if(k == 'parent') continue;
      var f = this[k];
      if(f.getData)
        data[k] = f.getData();
    }
    return data;
  }

  Dir.prototype.getSelector = function() {
    var tags = this.availTags;

    if(this.parent) {
      tags = tags.concat(this.parent.availTags);
    }

    return tags.join(',');
  };

  Dir.prototype.observe = function(done) {
    this.observers.push(done);
  }

  Dir.prototype.complete = function() {
    this.loaded = true;
    this.loading = false;
    this.observers.forEach(function(fn) {
      fn();
    });
    this.observers = [];

  }

  Dir.prototype.children = function(recursive) {
    var files = [];

    for(var filename in this) {
      if(filename == 'parent') continue;

      var f = this[filename];

      if(f instanceof File) {
        files.push(this[filename]);
      }

      if(f instanceof Dir) {
        if(recursive || filename == this.tagName) {
          [].push.apply(files, f.children(recursive));
        }
      }
    }

    return files;
  }

  Dir.prototype.load = function(done, recursive) {

   var self = this;

    if(this.loaded) {
      done();
      return;
    }

    this.observe(done);

    if(this.loading) {
      return;
    }

    this.loading = true;


    var resources = [];

    // FIXME
    // We should not need to sort client-side
    // Just do things in order of the index...
    // This whole thing is a huge waste of bytes
    if(this.window) {
      [].push.apply(resources, this.window.children(true));

      var self = this;
      this.window.load(function() {
        function runAll(dir) { 
          var globals = Object.keys(dir);

          globals = globals.sort(function(a,b) {
            return b.length < a.length ? 1 : -1;
          });

          each(globals, function(name) {
            if(dir[name] instanceof File) {
              var path = dir[name].path;
              require(path,'js');
            }
          });

          each(globals, function(name) {
            if(name == 'parent') return;
            if(dir[name] instanceof Dir) {
              runAll(dir[name]);
            }
          });
        }

        runAll(self.window);
      }, true);

    }

    if(this.components) {
      [].push.apply(resources, this.components.children(true));
    }

    if(this.lib) {
      [].push.apply(resources, this.lib.children(true));
    }

    if(this.parent && env === 'production') {
      if(this.path[this.path.length-1] == '/') debugger;
      get(this.path + '/assets.json', function(err, json) {
        var assets = JSON.parse(json);
        // debugger;
        for(var k in assets) {
          var file = File.map[k];
          if(!file) {
            console.warn('Unexpected file in asset package', k);
            continue;
          }
          file.data = assets[k];
          file.complete();
        }

        self.loaded = true;
        self.loading = false;
        done();
      });
    }
    else {
      [].push.apply(resources, this.children(true));

      parallel(resources, function() {
        self.complete()
      });
    }

  };

  function jsfn(txt, global) {
    var fn;

    if(global) {
      fn = new Function(txt);
    }
    else {
      fn = new Function('module','exports','require', txt);
    }

    return fn;
  }

  function normalize(path) {
    var result = [];
    var parts;
    var token;

    parts = path.split('/');

    for(var i=0, l=parts.length; i < l; ++i) {
      token = parts[i];

      if (token === '..') {
        result.pop();
      } else if (token && token !== '.') {
        result.push(token);
      }
    }
    return result.join('/').replace(/[\/]{2,}/g, '/'); 
  }

  function resolve(base,rel) {
    var basedir = base.split('/').slice(0,-1).join('/');
    var pathname = [basedir,rel].join('/');
    return normalize(pathname); 
  }

  function isGlobal(dir) {
    while(dir) {
      if(dir.tagName === 'window')
        return true;
      dir = dir.parent;
    }
    return false;
  }


  /**
   * Finds dependencies given a base just like node requires
   * but with an abstract extension.
   *
   * Examples:
   *
   * require('../body','js','/elements/header/header.js')
   * require('../body','html','/elements/header/header.js')
   *
   * @param {String} filename Module path
   * @param {String} ext File extension to look for  
   * @param {String} basename Reference point for relative paths  
   */

  function require(filename, ext, basename) {
    basename = basename || ".";


    var relpath = resolve(basename, filename); 

    var lastname = relpath.split('/').filter(function(n){return n;}).slice(-1)[0];

    var file;

    filename = filename.toLowerCase();
    lastname = lastname.toLowerCase();
    relpath = relpath.toLowerCase();

    // Make a list of possible paths
    var possible = [
      globalModules[filename],
      relpath,
      relpath+'.'+ext,
      relpath+'/'+lastname+'.'+ext,
      relpath+'/index.'+ext
    ];

    // Try all of them in order
    while(possible.length) {
      var attempt = File.map[possible.pop()];
      if(attempt) {
        file = attempt;
        break;
      }
    }

    if(!file) return false;

    if(ext != 'js') {
      return file.data;
    }

    var global = isGlobal(file);
    var fn = jsfn(file.data, global);

    if(global) {
      fn();
      return false;
    }

    // If we already executed return exports
    if(file.module) return file.module.exports;

    // Run for the first time and save exports
    function localRequire(name) {
      var dep = require(name, 'js', file.path);
      if(!dep) {
        // debugger;
        var dep = require(name, 'js', file.path);
        throw new Error("failed to require "+name+" from "+file.path);
      }
      return dep;
    }

    var module = {exports: {}};
    fn.call(window, module, module.exports, localRequire); 
    file.module = module;

    return module.exports;
  }

  /**
   * File
   *
   * Local tracker object for a single remote file.
   *
   * @param {String} path The path of the file relative to global `base`
   * @param {Dir} parent Parent dir object of the file
   */

  function File(path, parent) {
    this.observers = [];
    this.loading = false;
    this.loaded = false;
    this.path = path;
    this.parent = parent;

    File.map[path.toLowerCase()] = this; 
  }

  File.map = {};

  File.prototype = {
    handle: function() {
      var file = this.path;
      var ext = file.split('.').slice(-1)[0];

      var handlers = {
        html: pphtml,
        jade: ppjade,
        css: ppcss,
        json: ppjson,
        js: ppjs
      };

      if(handlers[ext]) {
        handlers[ext](name, data, file);
      }
    }

  , getData: function() { return this.data }

  , complete: function() {
      this.loading = false;
      this.loaded = true;

      var ext = this.path.split('.').slice(-1)[0];

      if(ext == 'js') {
        this.data = '\n// ' + this.path + '\n\n' + this.data;
      }

      if(ext == 'css') {
        ppcss(this.data, root.path+this.path);
      }

      if(ext == 'html') {
        this.data = pphtml(this);
      }

      each(this.observers, function(done) {
        done();
      });

      this.observers = [];
    }

  , observe: function(done) {
      this.observers.push(done);
    }

  , load: function(done) {
     var self = this;

      if(this.loaded) {
        done();
        return;
      }

      // No need to ajax load
      // css since we link it
      if(env == 'development'
        && this.path.match(/\.css$/)) {
        this.data = '';
        self.complete();
        done();
        return;
      }


      this.observe(done);

      if(this.loading) {
        return;
      }

      this.loading = true;

      get(self.path, function(err, data) {
        self.data = data;

        // FIXME
        // self.parent.parent.load(function() {
          self.complete();
        // });

        if(err) {
          console.error('Problem loading ' + self.path);
          return;
        }
      });
      
    }
  };

  var globalModules = {};

  function parseIndex(json) {
    var files = json.files;
    var modules = json.modules;
    globalModules = json.modules;

    var base = '_build/';
    each(files, function(file) {

      var nodes = file.split(/[\/|\.]/);
      var numDirs = file.split('/').length;

      var parent = root;
      var parentName = null;
      var dirpath = base;

      each(nodes, function(node,i) {

        // Space not allowed
        // TODO make actual accepted symbols
        if(node.match(/\s/)) return;

        // Merge _ prefixed directories in
        // to the parent directory
        if(node && node[0] != '_') {

          if(--numDirs) {
            dirpath += node + '/';
          }

          if(i == nodes.length-1) {
            var resource = new File(file, parent);
            parent[node] = resource;
            parent[node].tagName = node;
          }
          else {
            var dir = parent[node] = parent[node] || new Dir(dirpath.slice(0,-1), parent);

            dir.tagName = node;

            // Old IEs needs this.
            // It's a classic way of getting HTML5
            // elements recognized.
            // document.createElement(node);

            if(parent.availTags.indexOf(node) == -1) { 
              parent.availTags.push(node);
            }
          }

          parent = parent[node];
          parentName = node; 
        }
      });


    });
  }

  var started = false;
  elem.start = function(basepath, setenv, index) {
    if(started) {
      throw 'elem.start() called twice!';
    }
    started = true;

    // Make sure the basepath ends in a slash
    if(basepath[basepath.length-1] != '/')
      basepath += '/';

    root.path = basepath || '/';
    env = setenv || 'development';

    function loadRoot() {
      root.load(function() {
        domReady(function() {
          scan(document, root);
        });
      });
    }

    if(index) {
      parseIndex(index);
      loadRoot();
    }
    else {
      // Load index immediately
      loadIndex(loadRoot);
    }

  }

  // We don't support IE6 or 7. We can do a much simpler document ready check.
  function domReady(callback) {
    if (document.readyState !== "loading") return callback();

    var addListener = document.addEventListener || document.attachEvent,
    removeListener =  document.removeEventListener || document.detachEvent
    eventName = document.addEventListener ? "DOMContentLoaded" : "onreadystatechange"

    addListener.call(document, eventName, function(){
      removeListener( eventName, arguments.callee, false )
      callback()
    }, false )
  }

  function each(arr,fn) {
    for(var i=0,l=arr.length;i<l;++i) {
      fn(arr[i],i);
    }
  }

})();


