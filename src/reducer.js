const MIDDLEWARE = require('./middleware').MIDDLEWARE;

const MIDDLEWARE_PROTOCOL = require('./middleware').MIDDLEWARE_PROTOCOL;
  const MiddlewareRunner = require('./middleware').MiddlewareRunner;

const defaultConfiguration = {
  timeout: 5000
};

let Reducer;
let app;

Reducer = {
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
  queueSuccess: [],
  queueFail: [],
  extend(protoProps) {
    const child = Object.assign({}, this);

    if (!!protoProps.onSuccess) {
      child.queueSuccess.push(protoProps.onSuccess);
    }

    if (!!protoProps.onFail) {
      child.queueFail.push(protoProps.onFail);
    }

    return child;
  },
  create(actionName, schema, handler) {
    if (typeof schema === 'function') {
      handler = schema;
      schema = void 0;
    } else {
      if (typeof schema === 'object' && schema.wwtype !== 'schema') {
        throw new Error('The second argument of reducer will only function, or schema objects.');
      }
    }

    const _this = this;

    let Reducer = function(data, subscriber) {
      this._timestamp = Date.now();
      this._id = actionName.toLowerCase() + this._timestamp;
      this.subscriber = subscriber;
      this.queueSuccess = [];
      this.queueFail = [];

      this.useraction(data);
      this.addAction(this._id);
    };

    Reducer.wwtype = 'reducer';
    Reducer.actionName = actionName;
    Reducer.schema = schema;

    let fn = Object.assign(Reducer.prototype, {
      onSuccess: _this.onSuccess,
      onFail: _this.onFail
    });

    fn.useraction = handler;

    fn.id = () => this._id;
    fn.actionName = actionName;
    fn.createtime = () => this._timestamp;
    fn.addAction = (...args) => app.addAction(...args);
    fn.addError = (...args) => app.addError(...args);
    fn.removeAction = (...args) => app.removeAction(...args);
    fn.getStates = (...args) => app.getStates(...args);
    fn.setStates = (...args) => app.setStates(...args);

    fn.use = function(key, handlers) {
      switch (key) {
        case _this.SUCCESS:
          if (!handlers) return;

          if (Array.isArray(handlers)) {
            Array.prototype.push.apply(this.queueSuccess, handlers);
          } else {
            this.queueSuccess.push(handlers);
          }
          break;
        case _this.FAIL:
          if (!handlers) return;

          if (Array.isArray(handlers)) {
            Array.prototype.push.apply(this.queueFail, handlers);
          } else {
            this.queueFail.push(handlers);
          }
          break;
        default:
          throw new Error('undefined key');
      }
    };
    
    fn.loadScript = function(path, id) {
      if (!id) {
        id = path.toLowerCase();
      }

      let script = $('script[id=' + id + ']');

      if (!!script.length) {
        (this.onSuccess || this.success).call(this);
        return;
      }

      script = document.createElement('script');
      
      document.getElementsByTagName('head')[0].appendChild(script);
      
      script.addEventListener('load', (this.onSuccess || this.success).bind(this));
      script.addEventListener('error', (this.onFail || this.fail).bind(this));

      script.id = id;
      script.type = 'text/javascript';
      script.src = path;
    };

    fn.requestData = function(url, settings, method = 'GET') {
      if (typeof url === 'object') {
        settings = Object.assign({}, defaultConfiguration, { url });
      } else {
        settings = Object.assign({}, defaultConfiguration, settings, { url });
      }

      settings.type = method.toUpperCase();

      let success = function(...args) {
        const queueSuccess = Array.prototype.concat.call(_this.queueSuccess, this.queueSuccess);

        let middlewares = app.getMiddleware(MIDDLEWARE.REDUCER, MIDDLEWARE_PROTOCOL.AFTER);

        MiddlewareRunner.run(middlewares, MIDDLEWARE_PROTOCOL.AFTER, [app], function() {
          if (!!queueSuccess.length || !!this.onSuccess) {
            for (const item of queueSuccess) {
              item.apply(this, args);
            }

            !!this.onSuccess && this.onSuccess.apply(this, args);
          } else {
            this.success.apply(this, args);
          }
        }.bind(this));
      };

      let fail = function(...args) {
        const queueFail = Array.prototype.concat.call(_this.queueFail, this.queueFail);
        const jqXHR = args[0];

        let middlewares = app.getMiddleware(MIDDLEWARE.REDUCER, MIDDLEWARE_PROTOCOL.AFTER);

        MiddlewareRunner.run(middlewares, MIDDLEWARE_PROTOCOL.AFTER, [app], function() {
          if (!!jqXHR) {
            args = [{
              status: jqXHR.status,
              statusText: jqXHR.statusText || '',
              response: jqXHR.responseJSON || jqXHR.responseText
            }];
          }

          if (!!queueFail.length || !!this.onFail) {
            for (const item of queueFail) {
              item.apply(this, args);
            }

            !!this.onFail && this.onFail.apply(this, args);
          } else {
            this.fail.apply(this, args);
          }
        }.bind(this));
      };

      let middlewares = app.getMiddleware(MIDDLEWARE.REDUCER, MIDDLEWARE_PROTOCOL.BEFORE);

      MiddlewareRunner.run(middlewares, MIDDLEWARE_PROTOCOL.BEFORE, [settings, app], function() {
        return $.ajax(settings)
          .done(success.bind(this))
          .fail(fail.bind(this));
      }.bind(this));
    };

    /**
     *
     * @param url
     * @param settings
     */
    fn.getData = function(url, settings) {
      return this.requestData(url, settings, 'get');
    };

    /**
     *
     * @param url
     * @param settings
     */
    fn.putData = function(url, settings) {
      return this.requestData(url, settings, 'put');
    };

    /**
     *
     * @param url
     * @param settings
     */
    fn.postData = function(url, settings) {
      return this.requestData(url, settings, 'post');
    };

    /**
     *
     * @param url
     * @param settings
     */
    fn.deleteData = function(url, settings) {
      return this.requestData(url, settings, 'delete');
    };

    fn.success = function(data) {

    };

    fn.fail = function(request, error) {
      if ('abort' in request) {
        request.abort();
      }

      // TODO: 오류 발생시 바로 삭제하지 않고 작업을 Disable 시킨 후 오류 처리시 Retry 등의 로직을 수행할 수 있도록 선택지를 만듬
      this.removeAction(this._id);
      this.addError(error);
    };

    fn.finish = function(...args) {
      this.subscriber && this.subscriber.apply(this, args);

      this.removeAction(this._id);
    };

    fn.env = {};
    fn.env.template = function(templateStr, env) {
      if (typeof templateStr !== 'string') return templateStr;

      let renderStr = templateStr;
      let variables = templateStr.match(/{{\w+}}/g);

      if (variables) {
        variables.forEach(v => {
          let attrName = v.replace('{{', '').replace('}}', '');

          if (attrName in env) {
            renderStr = renderStr.replace(v, env[attrName]);
          }
        });
      }

      return renderStr;
    };

    return Reducer;
  }
};

module.exports = function(toolset) {
  if (!app) {
    app = toolset;
  }
  
  return Reducer;
};