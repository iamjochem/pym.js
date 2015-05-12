/*
 * This is a derivative of pym.js
 *
 * Pym.js is library that resizes an iframe based on the width of the parent and the resulting height of the child.
 * Check out the docs at http://blog.apps.npr.org/pym.js/ or the readme at README.md for usage.
 */

/* global module */

(function(factory) {
    if (typeof define === 'function' && define.amd) {
        define(factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        window.pym = factory.call(this);
    }
})(function() {
    var MESSAGE_DELIMITER = 'xPYMx';

    var lib     = {kkr: {}};

    var parents             = []; // Parent instances
    var childs              = []; // Child instances
    var kkrModalListeners   = []; // 'global' listeners for updates to the modal-offset value

    var kkr_id        = 'kkr-iframe';
    var kkr_body_attr = 'data-kkr-iframe-pos';

    var w  = window;
    var d  = document;
    var b  = d.getElementsByTagName('body')[0];
    var ie = !!w.attachEvent;

    /**
     * parseInt wrapper (fixed to base 10)
     * 
     * @param  {Number} i 
     * @return {Number}   
     */
    function pint(i) 
    {
        return parseInt(i, 10);
    }

    /**
     * simple throttling function - used to limit triggering event handlers for
     * resize/scroll/etc events 
     * 
     * @param  {Function} fn        
     * @param  {Number}   threshold     - milliseconds
     * @return {Function}             
     */
    function throttle(fn, threshold)
    {
        var to;

        return function() {
            var context = this, params = arguments;

            w.clearTimeout(to);

            to = w.setTimeout(function() {
                fn.apply(context, params);
            }, threshold);
        };
    }

    /**
     * v. simple window event listener binding
     * 
     * @param  {String}   ev         
     * @param  {Function} fn         
     * @param  {Boolean}   useCapture 
     * @return {?}              
     */
    function on(ev, fn, useCapture) 
    {
        return ie ? w.attachEvent('on' + ev, fn) : w.addEventListener(ev, fn, useCapture);
    } 

    /**
     * returns offset/position data regarding the given node
     * 
     * @param  {DOMNode} element 
     * @return {Object}         
     */
    function offset(element)
    {
        var body    = d.body,
            win     = d.defaultView,
            docElem = d.documentElement,
            box     = d.createElement('div');

        var clientTop,
            clientLeft,
            scrollTop,
            scrollLeft,
            isBoxModel;

        box.style.paddingLeft = box.style.width = "1px";
        
        body.appendChild(box);
        isBoxModel = pint(box.offsetWidth) === 2;
        body.removeChild(box);

        box = element.getBoundingClientRect();

        clientTop  = docElem.clientTop  || body.clientTop  || 0;
        clientLeft = docElem.clientLeft || body.clientLeft || 0;
        scrollTop  = win.pageYOffset || isBoxModel && docElem.scrollTop  || body.scrollTop;
        scrollLeft = win.pageXOffset || isBoxModel && docElem.scrollLeft || body.scrollLeft;

        return {
            client : {
                top    : pint(clientTop),
                left   : pint(clientLeft)
            },
            scroll : {
                top    : pint(scrollTop),
                left   : pint(scrollLeft)
            },
            offset : {
                top    : pint(box.top  + scrollTop  - clientTop),
                left   : pint(box.left + scrollLeft - clientLeft)
            },
        };
    }

    /**
     * encode (for message passing) the return value of offset()
     * 
     * @param  {Object} o 
     * @return {String}   
     */
    offset.encode = function(o) {
        return [
            o.client.top    || 0, 
            o.client.left   || 0, 
            o.scroll.top    || 0, 
            o.scroll.left   || 0, 
            o.offset.top    || 0, 
            o.offset.left   || 0].join('.');
    };

    /**
     * decode (after message passing) the return value of offset.encode()
     * 
     * @param  {String} o 
     * @return {Object}   
     */
    offset.decode = function(o) {
        var v = o.split('.');

        return {
            client : {
                top    : pint(v[0]),
                left   : pint(v[1])
            },
            scroll : {
                top    : pint(v[2]),
                left   : pint(v[3])
            },
            offset : {
                top    : pint(v[4]),
                left   : pint(v[5])
            },
        };
    };

    /**
     * returns height of the body
     * 
     * @return {Number}
     */
    function height() 
    { 
        return b.offsetHeight; 
    }
        

    /**
    * Generic function for parsing URL params.
    * Via http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
    *
    * @method _getParameterByName
    * @param {String} name The name of the paramter to get from the URL.
    */
    var _getParameterByName = function(name) {
        var regex = new RegExp("[\\?&]" + name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]') + '=([^&#]*)');
        var results = regex.exec(location.search);

        if (results === null) {
            return '';
        }

        return decodeURIComponent(results[1].replace(/\+/g, " "));
    };

    /**
     * Check the message to make sure it comes from an acceptable xdomain.
     * Defaults to '*' but can be overriden in config.
     *
     * @method _isSafeMessage
     * @param {Event} e The message event.
     * @param {Object} settings Configuration.
     */
    var _isSafeMessage = function(e, settings) {
        if (settings.xdomain !== '*') {
            // If origin doesn't match our xdomain, return.
            if (!e.origin.match(new RegExp(settings.xdomain + '$'))) { return; }
        }

        return true;
    };

    /**
     * Construct a message to send between frames.
     *
     * NB: We use string-building here because JSON message passing is
     * not supported in all browsers.
     *
     * @method _makeMessage
     * @param {String} id The unique id of the message recipient.
     * @param {String} messageType The type of message to send.
     * @param {String} message The message to send.
     */
    var _makeMessage = function(id, messageType, message) {
        var bits = ['pym', id, messageType, message];

        return bits.join(MESSAGE_DELIMITER);
    };

    /**
     * Construct a regex to validate and parse messages.
     *
     * @method _makeMessageRegex
     * @param {String} id The unique id of the message recipient.
     */
    var _makeMessageRegex = function(id) {
        var bits = ['pym', id, '(\\S+)', '(.+)'];

        return new RegExp('^' + bits.join(MESSAGE_DELIMITER) + '$');
    };

    /**
     * Initialize Pym for elements on page that have data-pym attributes.
     *
     * @method _autoInit
     */
    var _autoInit = function() {
        var parent;
        
        var elements = document.querySelectorAll(
            '[data-pym-src]:not([data-pym-auto-initialized])'
        );

        var autoloaded = [];
        var length     = elements.length;

        for (var idx = 0; idx < length; ++idx) {
            var element = elements[idx];

            /*
            * Mark automatically-initialized elements so they are not
            * re-initialized if the user includes pym.js more than once in the
            * same document.
            */
            element.setAttribute('data-pym-auto-initialized', '');

            // Ensure elements have an id
            if (element.id === '') {
                element.id = 'pym-' + idx;
            }

            var src = element.getAttribute('data-pym-src');
            var xdomain = element.getAttribute('data-pym-xdomain');
            var config = {};

            if (xdomain) {
               config.xdomain = xdomain;
            }

            parent = new lib.Parent(element.id, src, config);
            
            autoloaded.push(parent);
            autoloaded[element.id] = parent;
        }
        
        if (autoloaded.length) {
            lib.autoloaded = autoloaded;
        }
    };

    /**
     * Setup custom watchers & interval functions that automatically 
     * communicate document height (from Child to Parent) and iframe offset/position (from Parent to Child)
     * at regular intervals (once every 32ms)
     *
     * @method _initWatchers
     */
    function _initWatchers()
    {
        var lasth = null, fn; // previous body height value

        function childSend() 
        {
            var h = height(), l = childs.length, i = 0;

            if (!l || lasth === h) {
                return;
            }

            lasth = h;

            for (; i < l; i += 1) {
                childs[i].sendHeight();
            }
        } 

        function parentSend() 
        {
            var l = parents.length, i = 0, parent;

            if (!l) {
                return;
            }

            for (; i < l; i += 1) {
                parent = parents[i];
                parent.sendMessage('position', offset.encode(offset(parent.iframe)));
            }
        }     

        fn = throttle(parentSend, 16);

        on('resize', fn);
        on('scroll', fn);

        setInterval(childSend, 16);
    }

    /**
     * kkr-specific wrapper for `new lib.Parent()` - we force a specific value for 'id'
     * 
     * @param  {String} url    [description]
     * @param  {Object} config [description]
     * @return {Object}        [description]
     */
    lib.kkr.genParent = function(url, config) {
        return lib.Parent(kkr_id, url, config);
    };

    /**
     * kkr-specific wrapper for `new lib.Child()` - we force a specific value for 'id'
     * 
     * @param  {Object} config 
     * @return {Object}        
     */
    lib.kkr.genChild = function(config) {
        if (!config) {
            config = {};
        }

        config.id = kkr_id;
        return new lib.Child(config);
    };

    /**
     * returns the name of the "data-" attribute which may be set on the body of 
     * the child document - if set it contains an object specifying actual position/offset 
     * of the iframe. 
     * 
     * @return {String}
     */
    lib.kkr.getIframePosDataAttrName = function() {
        return kkr_body_attr;
    };

    /**
     * retrieves iframe offset/position data as stored in an attr of the body element.
     *
     * NB: this is only relevant to the child document!
     * 
     * @return {Object|null}
     */
    lib.kkr.getIframePosData         = function() {
        var v = b.getAttribute(kkr_body_attr);

        return v ? offset.decode(v) : null;
    };


    /**
     * retrieves iframe offset/position data as stored in an attr of the body element.
     *
     * NB: this is only relevant to the child document!
     * 
     * @return {Object|null}
     */
    lib.kkr.getModalOffset          = function(o) {
        try {
            var v = o || lib.kkr.getIframePosData();

            if (v.offset.top < v.scroll.top) {
                v = pint(v.scroll.top - v.offset.top);

                if (!isNaN(v)) {
                    return v;
                }
            }
        } catch (e) {}

        return 0;
    };    


    /**
     * returns the name of the "data-" attribute which may be set on the body of 
     * the child document - if set it contains an object specifying actual position/offset 
     * of the iframe. 
     * 
     * @return {String}
     */
    lib.kkr.addModalOffsetListener = function(fn) {
        kkrModalListeners.push(fn);        
    };

    /**
     * The Parent half of a response iframe.
     *
     * @class Parent
     * @param {String} id The id of the div into which the iframe will be rendered.
     * @param {String} url The url of the iframe source.
     * @param {Object} config Configuration to override the default settings.
     */
    lib.Parent = function(id, url, config) {
        this.id = id;
        this.url = url;
        this.el = document.getElementById(id);
        this.iframe = null;

        this.settings = {
            xdomain: '*'
        };

        this.messageRegex = _makeMessageRegex(this.id);
        this.messageHandlers = {};

        // ensure a config object
        config = (config || {});

        /**
         * Construct the iframe.
         *
         * @memberof Parent.prototype
         * @method _constructIframe
         */
        this._constructIframe = function() {
            // Calculate the width of this element.
            var width = this.el.offsetWidth.toString();

            // Create an iframe element attached to the document.
            this.iframe = document.createElement('iframe');

            // Save fragment id
            var hash = '';
            var hashIndex = this.url.indexOf('#');

            if (hashIndex > -1) {
                hash = this.url.substring(hashIndex, this.url.length);
                this.url = this.url.substring(0, hashIndex);
            }

            // If the URL contains querystring bits, use them.
            // Otherwise, just create a set of valid params.
            if (this.url.indexOf('?') < 0) {
                this.url += '?';
            } else {
                this.url += '&';
            }

            // Append the initial width as a querystring parameter, and the fragment id
            this.iframe.src = this.url + 'initialWidth=' + width + '&childId=' + this.id + hash;

            // Set some attributes to this proto-iframe.
            this.iframe.setAttribute('width', '100%');
            this.iframe.setAttribute('scrolling', 'no');
            this.iframe.setAttribute('marginheight', '0');
            this.iframe.setAttribute('frameborder', '0');

            // Append the iframe to our element.
            this.el.appendChild(this.iframe);

            // Add an event listener that will handle redrawing the child on resize.
            var that = this;
            on('resize', function() { that.sendWidth(); });
        };

        /**
         * Fire all event handlers for a given message type.
         *
         * @memberof Parent.prototype
         * @method _fire
         * @param {String} messageType The type of message.
         * @param {String} message The message data.
         */
        this._fire = function(messageType, message) {
            if (messageType in this.messageHandlers) {
                for (var i = 0; i < this.messageHandlers[messageType].length; i++) {
                   this.messageHandlers[messageType][i].call(this, message);
                }
            }
        };

        /**
         * @callback Parent~onMessageCallback
         * @param {String} message The message data.
         */

        /**
         * Process a new message from the child.
         *
         * @memberof Parent.prototype
         * @method _processMessage
         * @param {Event} e A message event.
         */
        this._processMessage = function(e) {
            if (!_isSafeMessage(e, this.settings)) { return; }

            // Grab the message from the child and parse it.
            var match = e.data.match(this.messageRegex);

            // If there's no match or too many matches in the message, punt.
            if (!match || match.length !== 3) {
                return false;
            }

            var messageType = match[1];
            var message = match[2];

            this._fire(messageType, message);
        };

        /**
         * Resize iframe in response to new height message from child.
         *
         * @memberof Parent.prototype
         * @method _onHeightMessage
         * @param {String} message The new height.
         */
        this._onHeightMessage = function(message) {
            /*
             * Handle parent height message from child.
             */
            var height = parseInt(message);

            this.iframe.setAttribute('height', height + 'px');
        };

        /**
         * Navigate parent to a new url.
         *
         * @memberof Parent.prototype
         * @method _onNavigateToMessage
         * @param {String} message The url to navigate to.
         */
        this._onNavigateToMessage = function(message) {
            /*
             * Handle parent scroll message from child.
             */
             document.location.href = message;
        };

        /**
         * Bind a callback to a given messageType from the child.
         *
         * Reserved message names are: "height", "scrollTo" and "navigateTo".
         *
         * @memberof Parent.prototype
         * @method onMessage
         * @param {String} messageType The type of message being listened for.
         * @param {Parent~onMessageCallback} callback The callback to invoke when a message of the given type is received.
         */
        this.onMessage = function(messageType, callback) {
            if (!(messageType in this.messageHandlers)) {
                this.messageHandlers[messageType] = [];
            }

            this.messageHandlers[messageType].push(callback);
        };

        /**
         * Send a message to the the child.
         *
         * @memberof Parent.prototype
         * @method sendMessage
         * @param {String} messageType The type of message to send.
         * @param {String} message The message data to send.
         */
        this.sendMessage = function(messageType, message) {
            this.el.getElementsByTagName('iframe')[0].contentWindow.postMessage(_makeMessage(this.id, messageType, message), '*');
        };

        /**
         * Transmit the current iframe width to the child.
         *
         * You shouldn't need to call this directly.
         *
         * @memberof Parent.prototype
         * @method sendWidth
         */
        this.sendWidth = function() {
            var width = this.el.offsetWidth.toString();

            this.sendMessage('width', width);
        };

        // Add any overrides to settings coming from config.
        for (var key in config) {
            this.settings[key] = config[key];
        }

        // Bind required message handlers
        this.onMessage('height', this._onHeightMessage);
        this.onMessage('navigateTo', this._onNavigateToMessage);

        // Add a listener for processing messages from the child.
        var that = this;
        on('message', function(e) { that._processMessage(e); }, false);

        // Construct the iframe in the container element.
        this._constructIframe();

        // store parent instance
        parents.push(this);

        return this;
    };

    /**
     * The Child half of a responsive iframe.
     *
     * @class Child
     * @param {Object} config Configuration to override the default settings.
     */
    lib.Child = function(config) {
        this.parentWidth = null;
        this.id = null || config.id;

        this.settings = {
            renderCallback: null,
            xdomain: '*',
            polling: 0
        };

        this.messageRegex = null;
        this.messageHandlers = {};

        // ensure a config object
        config = (config || {});

        /**
         * Bind a callback to a given messageType from the child.
         *
         * Reserved message names are: "width".
         *
         * @memberof Child.prototype
         * @method onMessage
         * @param {String} messageType The type of message being listened for.
         * @param {Child~onMessageCallback} callback The callback to invoke when a message of the given type is received.
         */
        this.onMessage = function(messageType, callback) {
            if (!(messageType in this.messageHandlers)) {
                this.messageHandlers[messageType] = [];
            }

            this.messageHandlers[messageType].push(callback);
        };

        /**
         * @callback Child~onMessageCallback
         * @param {String} message The message data.
         */

        /**
         * Fire all event handlers for a given message type.
         *
         * @memberof Parent.prototype
         * @method _fire
         * @param {String} messageType The type of message.
         * @param {String} message The message data.
         */
        this._fire = function(messageType, message) {
            /*
             * Fire all event handlers for a given message type.
             */
            if (messageType in this.messageHandlers) {
                for (var i = 0; i < this.messageHandlers[messageType].length; i++) {
                   this.messageHandlers[messageType][i].call(this, message);
                }
            }
        };

        /**
         * Process a new message from the parent.
         *
         * @memberof Child.prototype
         * @method _processMessage
         * @param {Event} e A message event.
         */
        this._processMessage = function(e) {
            /*
            * Process a new message from parent frame.
            */
            // First, punt if this isn't from an acceptable xdomain.
            if (!_isSafeMessage(e, this.settings)) { return; }

            // Get the message from the parent.
            var match = e.data.match(this.messageRegex);

            // If there's no match or it's a bad format, punt.
            if (!match || match.length !== 3) { return; }

            var messageType = match[1];
            var message = match[2];

            this._fire(messageType, message);
        };

        /**
         * Resize iframe in response to new width message from parent.
         *
         * @memberof Child.prototype
         * @method _onWidthMessage
         * @param {String} message The new width.
         */
        this._onWidthMessage = function(message) {
            /*
             * Handle width message from the child.
             */
            var width = parseInt(message);

            // Change the width if it's different.
            if (width !== this.parentWidth) {
                this.parentWidth = width;

                // Call the callback function if it exists.
                if (this.settings.renderCallback) {
                    this.settings.renderCallback(width);
                }

                // Send the height back to the parent.
                this.sendHeight();
            }
        };

        /**
         * Send a message to the the Parent.
         *
         * @memberof Child.prototype
         * @method sendMessage
         * @param {String} messageType The type of message to send.
         * @param {String} message The message data to send.
         */
        this.sendMessage = function(messageType, message) {
            /*
             * Send a message to the parent.
             */
            window.parent.postMessage(_makeMessage(this.id, messageType, message), '*');
        };

        /**
         * Transmit the current iframe height to the parent.
         *
         * Call this directly in cases where you manually alter the height of the iframe contents.
         *
         * @memberof Child.prototype
         * @method sendHeight
         */
        this.sendHeight = function() {
            /*
            * Transmit the current iframe height to the parent.
            * Make this callable from external scripts in case they update the body out of sequence.
            */

            // Get the child's height.
            var height = document.getElementsByTagName('body')[0].offsetHeight.toString();

            // Send the height to the parent.
            that.sendMessage('height', height);
        };

        /**
         * Scroll parent to a given element id.
         *
         * @memberof Child.prototype
         * @method scrollParentTo
         * @param {String} hash The id of the element to scroll to.
         */
        this.scrollParentTo = function(hash) {
            this.sendMessage('navigateTo', '#' + hash);
        };

        /**
         * Navigate parent to a given url.
         *
         * @memberof Parent.prototype
         * @method navigateParentTo
         * @param {String} url The url to navigate to.
         */
        this.navigateParentTo = function(url) {
            this.sendMessage('navigateTo', url);
        };

        // Identify what ID the parent knows this child as.
        this.id = _getParameterByName('childId') || config.id;
        this.messageRegex = new RegExp('^pym' + MESSAGE_DELIMITER + this.id + MESSAGE_DELIMITER + '(\\S+)' + MESSAGE_DELIMITER + '(.+)$');

        // Get the initial width from a URL parameter.
        var width = parseInt(_getParameterByName('initialWidth'));

        // Bind the required message handlers
        this.onMessage('width', this._onWidthMessage);

        // Initialize settings with overrides.
        for (var key in config) {
            this.settings[key] = config[key];
        }

        // Set up a listener to handle any incoming messages.
        var that = this;
        on('message', function(e) { that._processMessage(e); }, false);

        // If there's a callback function, call it.
        if (this.settings.renderCallback) {
            this.settings.renderCallback(width);
        }

        // Send the initial height to the parent.
        this.sendHeight();

        // store child instance 
        childs.push(this);

        // set message listener for our custom/automatic position messager
        this.onMessage('position', function(msg) {
            var i = 0, 
                l = kkrModalListeners.length,
                v = offset.decode(msg)
                ;

            b.setAttribute(kkr_body_attr, msg);

            if (!v) {
                return;
            }
        
            for (; i < l; i += 1) {
                kkrModalListeners[i].call(null, lib.kkr.getModalOffset(v));
            }            
        });

        return this;
    };

    // Initialize elements with pym data attributes
    _autoInit();

    // Initialize custom polling functions
    _initWatchers();

    return lib;
});