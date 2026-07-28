/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.bebop = (function() {

    /**
     * Namespace bebop.
     * @exports bebop
     * @namespace
     */
    var bebop = {};

    bebop.PriceUpdate = (function() {

        /**
         * Properties of a PriceUpdate.
         * @memberof bebop
         * @interface IPriceUpdate
         * @property {Uint8Array|null} [base] PriceUpdate base
         * @property {Uint8Array|null} [quote] PriceUpdate quote
         * @property {number|Long|null} [lastUpdateTs] PriceUpdate lastUpdateTs
         * @property {Array.<number>|null} [bids] PriceUpdate bids
         * @property {Array.<number>|null} [asks] PriceUpdate asks
         */

        /**
         * Constructs a new PriceUpdate.
         * @memberof bebop
         * @classdesc Represents a PriceUpdate.
         * @implements IPriceUpdate
         * @constructor
         * @param {bebop.IPriceUpdate=} [properties] Properties to set
         */
        function PriceUpdate(properties) {
            this.bids = [];
            this.asks = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PriceUpdate base.
         * @member {Uint8Array|null|undefined} base
         * @memberof bebop.PriceUpdate
         * @instance
         */
        PriceUpdate.prototype.base = null;

        /**
         * PriceUpdate quote.
         * @member {Uint8Array|null|undefined} quote
         * @memberof bebop.PriceUpdate
         * @instance
         */
        PriceUpdate.prototype.quote = null;

        /**
         * PriceUpdate lastUpdateTs.
         * @member {number|Long|null|undefined} lastUpdateTs
         * @memberof bebop.PriceUpdate
         * @instance
         */
        PriceUpdate.prototype.lastUpdateTs = null;

        /**
         * PriceUpdate bids.
         * @member {Array.<number>} bids
         * @memberof bebop.PriceUpdate
         * @instance
         */
        PriceUpdate.prototype.bids = $util.emptyArray;

        /**
         * PriceUpdate asks.
         * @member {Array.<number>} asks
         * @memberof bebop.PriceUpdate
         * @instance
         */
        PriceUpdate.prototype.asks = $util.emptyArray;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(PriceUpdate.prototype, "_base", {
            get: $util.oneOfGetter($oneOfFields = ["base"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(PriceUpdate.prototype, "_quote", {
            get: $util.oneOfGetter($oneOfFields = ["quote"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(PriceUpdate.prototype, "_lastUpdateTs", {
            get: $util.oneOfGetter($oneOfFields = ["lastUpdateTs"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new PriceUpdate instance using the specified properties.
         * @function create
         * @memberof bebop.PriceUpdate
         * @static
         * @param {bebop.IPriceUpdate=} [properties] Properties to set
         * @returns {bebop.PriceUpdate} PriceUpdate instance
         */
        PriceUpdate.create = function create(properties) {
            return new PriceUpdate(properties);
        };

        /**
         * Encodes the specified PriceUpdate message. Does not implicitly {@link bebop.PriceUpdate.verify|verify} messages.
         * @function encode
         * @memberof bebop.PriceUpdate
         * @static
         * @param {bebop.IPriceUpdate} message PriceUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PriceUpdate.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.base != null && Object.hasOwnProperty.call(message, "base"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.base);
            if (message.quote != null && Object.hasOwnProperty.call(message, "quote"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.quote);
            if (message.lastUpdateTs != null && Object.hasOwnProperty.call(message, "lastUpdateTs"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.lastUpdateTs);
            if (message.bids != null && message.bids.length) {
                writer.uint32(/* id 4, wireType 2 =*/34).fork();
                for (var i = 0; i < message.bids.length; ++i)
                    writer.float(message.bids[i]);
                writer.ldelim();
            }
            if (message.asks != null && message.asks.length) {
                writer.uint32(/* id 5, wireType 2 =*/42).fork();
                for (var i = 0; i < message.asks.length; ++i)
                    writer.float(message.asks[i]);
                writer.ldelim();
            }
            return writer;
        };

        /**
         * Encodes the specified PriceUpdate message, length delimited. Does not implicitly {@link bebop.PriceUpdate.verify|verify} messages.
         * @function encodeDelimited
         * @memberof bebop.PriceUpdate
         * @static
         * @param {bebop.IPriceUpdate} message PriceUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PriceUpdate.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a PriceUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof bebop.PriceUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {bebop.PriceUpdate} PriceUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PriceUpdate.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.bebop.PriceUpdate();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.base = reader.bytes();
                        break;
                    }
                case 2: {
                        message.quote = reader.bytes();
                        break;
                    }
                case 3: {
                        message.lastUpdateTs = reader.uint64();
                        break;
                    }
                case 4: {
                        if (!(message.bids && message.bids.length))
                            message.bids = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.bids.push(reader.float());
                        } else
                            message.bids.push(reader.float());
                        break;
                    }
                case 5: {
                        if (!(message.asks && message.asks.length))
                            message.asks = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.asks.push(reader.float());
                        } else
                            message.asks.push(reader.float());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a PriceUpdate message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof bebop.PriceUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {bebop.PriceUpdate} PriceUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PriceUpdate.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a PriceUpdate message.
         * @function verify
         * @memberof bebop.PriceUpdate
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        PriceUpdate.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.base != null && message.hasOwnProperty("base")) {
                properties._base = 1;
                if (!(message.base && typeof message.base.length === "number" || $util.isString(message.base)))
                    return "base: buffer expected";
            }
            if (message.quote != null && message.hasOwnProperty("quote")) {
                properties._quote = 1;
                if (!(message.quote && typeof message.quote.length === "number" || $util.isString(message.quote)))
                    return "quote: buffer expected";
            }
            if (message.lastUpdateTs != null && message.hasOwnProperty("lastUpdateTs")) {
                properties._lastUpdateTs = 1;
                if (!$util.isInteger(message.lastUpdateTs) && !(message.lastUpdateTs && $util.isInteger(message.lastUpdateTs.low) && $util.isInteger(message.lastUpdateTs.high)))
                    return "lastUpdateTs: integer|Long expected";
            }
            if (message.bids != null && message.hasOwnProperty("bids")) {
                if (!Array.isArray(message.bids))
                    return "bids: array expected";
                for (var i = 0; i < message.bids.length; ++i)
                    if (typeof message.bids[i] !== "number")
                        return "bids: number[] expected";
            }
            if (message.asks != null && message.hasOwnProperty("asks")) {
                if (!Array.isArray(message.asks))
                    return "asks: array expected";
                for (var i = 0; i < message.asks.length; ++i)
                    if (typeof message.asks[i] !== "number")
                        return "asks: number[] expected";
            }
            return null;
        };

        /**
         * Creates a PriceUpdate message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof bebop.PriceUpdate
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {bebop.PriceUpdate} PriceUpdate
         */
        PriceUpdate.fromObject = function fromObject(object) {
            if (object instanceof $root.bebop.PriceUpdate)
                return object;
            var message = new $root.bebop.PriceUpdate();
            if (object.base != null)
                if (typeof object.base === "string")
                    $util.base64.decode(object.base, message.base = $util.newBuffer($util.base64.length(object.base)), 0);
                else if (object.base.length >= 0)
                    message.base = object.base;
            if (object.quote != null)
                if (typeof object.quote === "string")
                    $util.base64.decode(object.quote, message.quote = $util.newBuffer($util.base64.length(object.quote)), 0);
                else if (object.quote.length >= 0)
                    message.quote = object.quote;
            if (object.lastUpdateTs != null)
                if ($util.Long)
                    (message.lastUpdateTs = $util.Long.fromValue(object.lastUpdateTs)).unsigned = true;
                else if (typeof object.lastUpdateTs === "string")
                    message.lastUpdateTs = parseInt(object.lastUpdateTs, 10);
                else if (typeof object.lastUpdateTs === "number")
                    message.lastUpdateTs = object.lastUpdateTs;
                else if (typeof object.lastUpdateTs === "object")
                    message.lastUpdateTs = new $util.LongBits(object.lastUpdateTs.low >>> 0, object.lastUpdateTs.high >>> 0).toNumber(true);
            if (object.bids) {
                if (!Array.isArray(object.bids))
                    throw TypeError(".bebop.PriceUpdate.bids: array expected");
                message.bids = [];
                for (var i = 0; i < object.bids.length; ++i)
                    message.bids[i] = Number(object.bids[i]);
            }
            if (object.asks) {
                if (!Array.isArray(object.asks))
                    throw TypeError(".bebop.PriceUpdate.asks: array expected");
                message.asks = [];
                for (var i = 0; i < object.asks.length; ++i)
                    message.asks[i] = Number(object.asks[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a PriceUpdate message. Also converts values to other types if specified.
         * @function toObject
         * @memberof bebop.PriceUpdate
         * @static
         * @param {bebop.PriceUpdate} message PriceUpdate
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        PriceUpdate.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.bids = [];
                object.asks = [];
            }
            if (message.base != null && message.hasOwnProperty("base")) {
                object.base = options.bytes === String ? $util.base64.encode(message.base, 0, message.base.length) : options.bytes === Array ? Array.prototype.slice.call(message.base) : message.base;
                if (options.oneofs)
                    object._base = "base";
            }
            if (message.quote != null && message.hasOwnProperty("quote")) {
                object.quote = options.bytes === String ? $util.base64.encode(message.quote, 0, message.quote.length) : options.bytes === Array ? Array.prototype.slice.call(message.quote) : message.quote;
                if (options.oneofs)
                    object._quote = "quote";
            }
            if (message.lastUpdateTs != null && message.hasOwnProperty("lastUpdateTs")) {
                if (typeof message.lastUpdateTs === "number")
                    object.lastUpdateTs = options.longs === String ? String(message.lastUpdateTs) : message.lastUpdateTs;
                else
                    object.lastUpdateTs = options.longs === String ? $util.Long.prototype.toString.call(message.lastUpdateTs) : options.longs === Number ? new $util.LongBits(message.lastUpdateTs.low >>> 0, message.lastUpdateTs.high >>> 0).toNumber(true) : message.lastUpdateTs;
                if (options.oneofs)
                    object._lastUpdateTs = "lastUpdateTs";
            }
            if (message.bids && message.bids.length) {
                object.bids = [];
                for (var j = 0; j < message.bids.length; ++j)
                    object.bids[j] = options.json && !isFinite(message.bids[j]) ? String(message.bids[j]) : message.bids[j];
            }
            if (message.asks && message.asks.length) {
                object.asks = [];
                for (var j = 0; j < message.asks.length; ++j)
                    object.asks[j] = options.json && !isFinite(message.asks[j]) ? String(message.asks[j]) : message.asks[j];
            }
            return object;
        };

        /**
         * Converts this PriceUpdate to JSON.
         * @function toJSON
         * @memberof bebop.PriceUpdate
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        PriceUpdate.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for PriceUpdate
         * @function getTypeUrl
         * @memberof bebop.PriceUpdate
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PriceUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/bebop.PriceUpdate";
        };

        return PriceUpdate;
    })();

    bebop.BebopPricingUpdate = (function() {

        /**
         * Properties of a BebopPricingUpdate.
         * @memberof bebop
         * @interface IBebopPricingUpdate
         * @property {Array.<bebop.IPriceUpdate>|null} [pairs] BebopPricingUpdate pairs
         */

        /**
         * Constructs a new BebopPricingUpdate.
         * @memberof bebop
         * @classdesc Represents a BebopPricingUpdate.
         * @implements IBebopPricingUpdate
         * @constructor
         * @param {bebop.IBebopPricingUpdate=} [properties] Properties to set
         */
        function BebopPricingUpdate(properties) {
            this.pairs = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * BebopPricingUpdate pairs.
         * @member {Array.<bebop.IPriceUpdate>} pairs
         * @memberof bebop.BebopPricingUpdate
         * @instance
         */
        BebopPricingUpdate.prototype.pairs = $util.emptyArray;

        /**
         * Creates a new BebopPricingUpdate instance using the specified properties.
         * @function create
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {bebop.IBebopPricingUpdate=} [properties] Properties to set
         * @returns {bebop.BebopPricingUpdate} BebopPricingUpdate instance
         */
        BebopPricingUpdate.create = function create(properties) {
            return new BebopPricingUpdate(properties);
        };

        /**
         * Encodes the specified BebopPricingUpdate message. Does not implicitly {@link bebop.BebopPricingUpdate.verify|verify} messages.
         * @function encode
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {bebop.IBebopPricingUpdate} message BebopPricingUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BebopPricingUpdate.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.pairs != null && message.pairs.length)
                for (var i = 0; i < message.pairs.length; ++i)
                    $root.bebop.PriceUpdate.encode(message.pairs[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified BebopPricingUpdate message, length delimited. Does not implicitly {@link bebop.BebopPricingUpdate.verify|verify} messages.
         * @function encodeDelimited
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {bebop.IBebopPricingUpdate} message BebopPricingUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BebopPricingUpdate.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a BebopPricingUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {bebop.BebopPricingUpdate} BebopPricingUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BebopPricingUpdate.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.bebop.BebopPricingUpdate();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.pairs && message.pairs.length))
                            message.pairs = [];
                        message.pairs.push($root.bebop.PriceUpdate.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a BebopPricingUpdate message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {bebop.BebopPricingUpdate} BebopPricingUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BebopPricingUpdate.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a BebopPricingUpdate message.
         * @function verify
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        BebopPricingUpdate.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.pairs != null && message.hasOwnProperty("pairs")) {
                if (!Array.isArray(message.pairs))
                    return "pairs: array expected";
                for (var i = 0; i < message.pairs.length; ++i) {
                    var error = $root.bebop.PriceUpdate.verify(message.pairs[i]);
                    if (error)
                        return "pairs." + error;
                }
            }
            return null;
        };

        /**
         * Creates a BebopPricingUpdate message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {bebop.BebopPricingUpdate} BebopPricingUpdate
         */
        BebopPricingUpdate.fromObject = function fromObject(object) {
            if (object instanceof $root.bebop.BebopPricingUpdate)
                return object;
            var message = new $root.bebop.BebopPricingUpdate();
            if (object.pairs) {
                if (!Array.isArray(object.pairs))
                    throw TypeError(".bebop.BebopPricingUpdate.pairs: array expected");
                message.pairs = [];
                for (var i = 0; i < object.pairs.length; ++i) {
                    if (typeof object.pairs[i] !== "object")
                        throw TypeError(".bebop.BebopPricingUpdate.pairs: object expected");
                    message.pairs[i] = $root.bebop.PriceUpdate.fromObject(object.pairs[i]);
                }
            }
            return message;
        };

        /**
         * Creates a plain object from a BebopPricingUpdate message. Also converts values to other types if specified.
         * @function toObject
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {bebop.BebopPricingUpdate} message BebopPricingUpdate
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        BebopPricingUpdate.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.pairs = [];
            if (message.pairs && message.pairs.length) {
                object.pairs = [];
                for (var j = 0; j < message.pairs.length; ++j)
                    object.pairs[j] = $root.bebop.PriceUpdate.toObject(message.pairs[j], options);
            }
            return object;
        };

        /**
         * Converts this BebopPricingUpdate to JSON.
         * @function toJSON
         * @memberof bebop.BebopPricingUpdate
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        BebopPricingUpdate.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for BebopPricingUpdate
         * @function getTypeUrl
         * @memberof bebop.BebopPricingUpdate
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        BebopPricingUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/bebop.BebopPricingUpdate";
        };

        return BebopPricingUpdate;
    })();

    return bebop;
})();

module.exports = $root;
