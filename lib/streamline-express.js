var lastArgumentName = function(f) {
  var args = f.toString().match(/(function.+\()(.+(?=\)))/)[2].split(",");
  return args[args.length - 1].trim();
};

// This can recognize handler(req, res, next) and
// handler(err, req, res, next) pattern, but
// only if `next` argument is named 'next'.
var wrap = function(handler) {
  var argLength = handler.length;
  var lastArgName = lastArgumentName(handler);

  // handler(req, res)
  // handler(req, res, next)
  // handler(err, req, res, next)
  if (lastArgName === "next" || argLength === 2) return handler;

  // handler(err, req, res, next, _)
  // handler(req, res, next, _)
  // handler(req, res, _)
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var next = args[args.length - 1];
    args[args.length - 1] = function(err) {
      if (err) {
        if (args.length > 4 && args[0]) err.innerError = args[0];
        return next(err);
      }
    };
    return handler.apply(this, args);
  }
};

var patch = function(app, method) {
  if (!app[method]) return;

  var original = app[method];
  app[method] = function(/* path, [callback...], callback */) {
    // Special 'get' case.
    if (!(method === "get" && arguments.length === 1)) {
      var arg;
      for (var i = 1; i < arguments.length; i++) {
        arg = arguments[i];
        if (Array.isArray(arg)) {
          for (var j = 0; j < arg.length; j++) {
            arg[j] = wrap(arg[j]);
          }
        } else {
          arguments[i] = wrap(arg);
        }
      }
    }
    return original.apply(this, arguments);
  };
};

module.exports = function(app) {
  var methods = require("methods");
  methods.push("all");

  for (var i = 0; i < methods.length; i++) {
    patch(app, methods[i]);
  }

  // Unload 'methods' module after patch.
  delete require.cache["methods"];

  // Patch app.use
  var originalUseFunc = app.use;
  app.use = function(/* [path], callback */) {
    var callback = arguments[arguments.length - 1];
    if (typeof callback === "function") {
      arguments[arguments.length - 1] = wrap(callback);
    }
    return originalUseFunc.apply(this, arguments);
  };

  // Patch app.param
  var originalParamFunc = app.param;
  app.param = function(/* [name], callback */) {
    if (typeof arguments[0] !== "function") {
      var callback = arguments[1];
      if (callback.length > 4) {
        arguments[1] = function(req, res, next, val) {
          callback(req, res, next, val, function(err) {
            if (err) return next(err);
          });
        };
      }
    }
    return originalParamFunc.apply(this, arguments);
  };

  return app;
};
