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

    bebop.LevelInfo = (function() {

        /**
         * Properties of a LevelInfo.
         * @memberof bebop
         * @interface ILevelInfo
         * @property {Uint8Array|null} [baseAddress] LevelInfo baseAddress
         * @property {number|null} [baseDecimals] LevelInfo baseDecimals
         * @property {Uint8Array|null} [quoteAddress] LevelInfo quoteAddress
         * @property {number|null} [quoteDecimals] LevelInfo quoteDecimals
         * @property {Array.<number>|null} [bids] LevelInfo bids
         * @property {Array.<number>|null} [asks] LevelInfo asks
         */

        /**
         * Constructs a new LevelInfo.
         * @memberof bebop
         * @classdesc Represents a LevelInfo.
         * @implements ILevelInfo
         * @constructor
         * @param {bebop.ILevelInfo=} [properties] Properties to set
         */
        function LevelInfo(properties) {
            this.bids = [];
            this.asks = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LevelInfo baseAddress.
         * @member {Uint8Array} baseAddress
         * @memberof bebop.LevelInfo
         * @instance
         */
        LevelInfo.prototype.baseAddress = $util.newBuffer([]);

        /**
         * LevelInfo baseDecimals.
         * @member {number} baseDecimals
         * @memberof bebop.LevelInfo
         * @instance
         */
        LevelInfo.prototype.baseDecimals = 0;

        /**
         * LevelInfo quoteAddress.
         * @member {Uint8Array} quoteAddress
         * @memberof bebop.LevelInfo
         * @instance
         */
        LevelInfo.prototype.quoteAddress = $util.newBuffer([]);

        /**
         * LevelInfo quoteDecimals.
         * @member {number} quoteDecimals
         * @memberof bebop.LevelInfo
         * @instance
         */
        LevelInfo.prototype.quoteDecimals = 0;

        /**
         * LevelInfo bids.
         * @member {Array.<number>} bids
         * @memberof bebop.LevelInfo
         * @instance
         */
        LevelInfo.prototype.bids = $util.emptyArray;

        /**
         * LevelInfo asks.
         * @member {Array.<number>} asks
         * @memberof bebop.LevelInfo
         * @instance
         */
        LevelInfo.prototype.asks = $util.emptyArray;

        /**
         * Creates a new LevelInfo instance using the specified properties.
         * @function create
         * @memberof bebop.LevelInfo
         * @static
         * @param {bebop.ILevelInfo=} [properties] Properties to set
         * @returns {bebop.LevelInfo} LevelInfo instance
         */
        LevelInfo.create = function create(properties) {
            return new LevelInfo(properties);
        };

        /**
         * Encodes the specified LevelInfo message. Does not implicitly {@link bebop.LevelInfo.verify|verify} messages.
         * @function encode
         * @memberof bebop.LevelInfo
         * @static
         * @param {bebop.ILevelInfo} message LevelInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LevelInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.baseAddress != null && Object.hasOwnProperty.call(message, "baseAddress"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.baseAddress);
            if (message.baseDecimals != null && Object.hasOwnProperty.call(message, "baseDecimals"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.baseDecimals);
            if (message.quoteAddress != null && Object.hasOwnProperty.call(message, "quoteAddress"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.quoteAddress);
            if (message.quoteDecimals != null && Object.hasOwnProperty.call(message, "quoteDecimals"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.quoteDecimals);
            if (message.bids != null && message.bids.length) {
                writer.uint32(/* id 5, wireType 2 =*/42).fork();
                for (var i = 0; i < message.bids.length; ++i)
                    writer.double(message.bids[i]);
                writer.ldelim();
            }
            if (message.asks != null && message.asks.length) {
                writer.uint32(/* id 6, wireType 2 =*/50).fork();
                for (var i = 0; i < message.asks.length; ++i)
                    writer.double(message.asks[i]);
                writer.ldelim();
            }
            return writer;
        };

        /**
         * Encodes the specified LevelInfo message, length delimited. Does not implicitly {@link bebop.LevelInfo.verify|verify} messages.
         * @function encodeDelimited
         * @memberof bebop.LevelInfo
         * @static
         * @param {bebop.ILevelInfo} message LevelInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LevelInfo.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a LevelInfo message from the specified reader or buffer.
         * @function decode
         * @memberof bebop.LevelInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {bebop.LevelInfo} LevelInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LevelInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.bebop.LevelInfo();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.baseAddress = reader.bytes();
                        break;
                    }
                case 2: {
                        message.baseDecimals = reader.uint32();
                        break;
                    }
                case 3: {
                        message.quoteAddress = reader.bytes();
                        break;
                    }
                case 4: {
                        message.quoteDecimals = reader.uint32();
                        break;
                    }
                case 5: {
                        if (!(message.bids && message.bids.length))
                            message.bids = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.bids.push(reader.double());
                        } else
                            message.bids.push(reader.double());
                        break;
                    }
                case 6: {
                        if (!(message.asks && message.asks.length))
                            message.asks = [];
                        if ((tag & 7) === 2) {
                            var end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2)
                                message.asks.push(reader.double());
                        } else
                            message.asks.push(reader.double());
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
         * Decodes a LevelInfo message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof bebop.LevelInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {bebop.LevelInfo} LevelInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LevelInfo.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a LevelInfo message.
         * @function verify
         * @memberof bebop.LevelInfo
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        LevelInfo.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.baseAddress != null && message.hasOwnProperty("baseAddress"))
                if (!(message.baseAddress && typeof message.baseAddress.length === "number" || $util.isString(message.baseAddress)))
                    return "baseAddress: buffer expected";
            if (message.baseDecimals != null && message.hasOwnProperty("baseDecimals"))
                if (!$util.isInteger(message.baseDecimals))
                    return "baseDecimals: integer expected";
            if (message.quoteAddress != null && message.hasOwnProperty("quoteAddress"))
                if (!(message.quoteAddress && typeof message.quoteAddress.length === "number" || $util.isString(message.quoteAddress)))
                    return "quoteAddress: buffer expected";
            if (message.quoteDecimals != null && message.hasOwnProperty("quoteDecimals"))
                if (!$util.isInteger(message.quoteDecimals))
                    return "quoteDecimals: integer expected";
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
         * Creates a LevelInfo message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof bebop.LevelInfo
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {bebop.LevelInfo} LevelInfo
         */
        LevelInfo.fromObject = function fromObject(object) {
            if (object instanceof $root.bebop.LevelInfo)
                return object;
            var message = new $root.bebop.LevelInfo();
            if (object.baseAddress != null)
                if (typeof object.baseAddress === "string")
                    $util.base64.decode(object.baseAddress, message.baseAddress = $util.newBuffer($util.base64.length(object.baseAddress)), 0);
                else if (object.baseAddress.length >= 0)
                    message.baseAddress = object.baseAddress;
            if (object.baseDecimals != null)
                message.baseDecimals = object.baseDecimals >>> 0;
            if (object.quoteAddress != null)
                if (typeof object.quoteAddress === "string")
                    $util.base64.decode(object.quoteAddress, message.quoteAddress = $util.newBuffer($util.base64.length(object.quoteAddress)), 0);
                else if (object.quoteAddress.length >= 0)
                    message.quoteAddress = object.quoteAddress;
            if (object.quoteDecimals != null)
                message.quoteDecimals = object.quoteDecimals >>> 0;
            if (object.bids) {
                if (!Array.isArray(object.bids))
                    throw TypeError(".bebop.LevelInfo.bids: array expected");
                message.bids = [];
                for (var i = 0; i < object.bids.length; ++i)
                    message.bids[i] = Number(object.bids[i]);
            }
            if (object.asks) {
                if (!Array.isArray(object.asks))
                    throw TypeError(".bebop.LevelInfo.asks: array expected");
                message.asks = [];
                for (var i = 0; i < object.asks.length; ++i)
                    message.asks[i] = Number(object.asks[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a LevelInfo message. Also converts values to other types if specified.
         * @function toObject
         * @memberof bebop.LevelInfo
         * @static
         * @param {bebop.LevelInfo} message LevelInfo
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        LevelInfo.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.bids = [];
                object.asks = [];
            }
            if (options.defaults) {
                if (options.bytes === String)
                    object.baseAddress = "";
                else {
                    object.baseAddress = [];
                    if (options.bytes !== Array)
                        object.baseAddress = $util.newBuffer(object.baseAddress);
                }
                object.baseDecimals = 0;
                if (options.bytes === String)
                    object.quoteAddress = "";
                else {
                    object.quoteAddress = [];
                    if (options.bytes !== Array)
                        object.quoteAddress = $util.newBuffer(object.quoteAddress);
                }
                object.quoteDecimals = 0;
            }
            if (message.baseAddress != null && message.hasOwnProperty("baseAddress"))
                object.baseAddress = options.bytes === String ? $util.base64.encode(message.baseAddress, 0, message.baseAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.baseAddress) : message.baseAddress;
            if (message.baseDecimals != null && message.hasOwnProperty("baseDecimals"))
                object.baseDecimals = message.baseDecimals;
            if (message.quoteAddress != null && message.hasOwnProperty("quoteAddress"))
                object.quoteAddress = options.bytes === String ? $util.base64.encode(message.quoteAddress, 0, message.quoteAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.quoteAddress) : message.quoteAddress;
            if (message.quoteDecimals != null && message.hasOwnProperty("quoteDecimals"))
                object.quoteDecimals = message.quoteDecimals;
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
         * Converts this LevelInfo to JSON.
         * @function toJSON
         * @memberof bebop.LevelInfo
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        LevelInfo.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for LevelInfo
         * @function getTypeUrl
         * @memberof bebop.LevelInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LevelInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/bebop.LevelInfo";
        };

        return LevelInfo;
    })();

    bebop.LevelMsg = (function() {

        /**
         * Properties of a LevelMsg.
         * @memberof bebop
         * @interface ILevelMsg
         * @property {Array.<bebop.ILevelInfo>|null} [levels] LevelMsg levels
         * @property {Uint8Array|null} [makerAddress] LevelMsg makerAddress
         */

        /**
         * Constructs a new LevelMsg.
         * @memberof bebop
         * @classdesc Represents a LevelMsg.
         * @implements ILevelMsg
         * @constructor
         * @param {bebop.ILevelMsg=} [properties] Properties to set
         */
        function LevelMsg(properties) {
            this.levels = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LevelMsg levels.
         * @member {Array.<bebop.ILevelInfo>} levels
         * @memberof bebop.LevelMsg
         * @instance
         */
        LevelMsg.prototype.levels = $util.emptyArray;

        /**
         * LevelMsg makerAddress.
         * @member {Uint8Array} makerAddress
         * @memberof bebop.LevelMsg
         * @instance
         */
        LevelMsg.prototype.makerAddress = $util.newBuffer([]);

        /**
         * Creates a new LevelMsg instance using the specified properties.
         * @function create
         * @memberof bebop.LevelMsg
         * @static
         * @param {bebop.ILevelMsg=} [properties] Properties to set
         * @returns {bebop.LevelMsg} LevelMsg instance
         */
        LevelMsg.create = function create(properties) {
            return new LevelMsg(properties);
        };

        /**
         * Encodes the specified LevelMsg message. Does not implicitly {@link bebop.LevelMsg.verify|verify} messages.
         * @function encode
         * @memberof bebop.LevelMsg
         * @static
         * @param {bebop.ILevelMsg} message LevelMsg message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LevelMsg.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.levels != null && message.levels.length)
                for (var i = 0; i < message.levels.length; ++i)
                    $root.bebop.LevelInfo.encode(message.levels[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.makerAddress != null && Object.hasOwnProperty.call(message, "makerAddress"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.makerAddress);
            return writer;
        };

        /**
         * Encodes the specified LevelMsg message, length delimited. Does not implicitly {@link bebop.LevelMsg.verify|verify} messages.
         * @function encodeDelimited
         * @memberof bebop.LevelMsg
         * @static
         * @param {bebop.ILevelMsg} message LevelMsg message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LevelMsg.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a LevelMsg message from the specified reader or buffer.
         * @function decode
         * @memberof bebop.LevelMsg
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {bebop.LevelMsg} LevelMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LevelMsg.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.bebop.LevelMsg();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.levels && message.levels.length))
                            message.levels = [];
                        message.levels.push($root.bebop.LevelInfo.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        message.makerAddress = reader.bytes();
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
         * Decodes a LevelMsg message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof bebop.LevelMsg
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {bebop.LevelMsg} LevelMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LevelMsg.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a LevelMsg message.
         * @function verify
         * @memberof bebop.LevelMsg
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        LevelMsg.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.levels != null && message.hasOwnProperty("levels")) {
                if (!Array.isArray(message.levels))
                    return "levels: array expected";
                for (var i = 0; i < message.levels.length; ++i) {
                    var error = $root.bebop.LevelInfo.verify(message.levels[i]);
                    if (error)
                        return "levels." + error;
                }
            }
            if (message.makerAddress != null && message.hasOwnProperty("makerAddress"))
                if (!(message.makerAddress && typeof message.makerAddress.length === "number" || $util.isString(message.makerAddress)))
                    return "makerAddress: buffer expected";
            return null;
        };

        /**
         * Creates a LevelMsg message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof bebop.LevelMsg
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {bebop.LevelMsg} LevelMsg
         */
        LevelMsg.fromObject = function fromObject(object) {
            if (object instanceof $root.bebop.LevelMsg)
                return object;
            var message = new $root.bebop.LevelMsg();
            if (object.levels) {
                if (!Array.isArray(object.levels))
                    throw TypeError(".bebop.LevelMsg.levels: array expected");
                message.levels = [];
                for (var i = 0; i < object.levels.length; ++i) {
                    if (typeof object.levels[i] !== "object")
                        throw TypeError(".bebop.LevelMsg.levels: object expected");
                    message.levels[i] = $root.bebop.LevelInfo.fromObject(object.levels[i]);
                }
            }
            if (object.makerAddress != null)
                if (typeof object.makerAddress === "string")
                    $util.base64.decode(object.makerAddress, message.makerAddress = $util.newBuffer($util.base64.length(object.makerAddress)), 0);
                else if (object.makerAddress.length >= 0)
                    message.makerAddress = object.makerAddress;
            return message;
        };

        /**
         * Creates a plain object from a LevelMsg message. Also converts values to other types if specified.
         * @function toObject
         * @memberof bebop.LevelMsg
         * @static
         * @param {bebop.LevelMsg} message LevelMsg
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        LevelMsg.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.levels = [];
            if (options.defaults)
                if (options.bytes === String)
                    object.makerAddress = "";
                else {
                    object.makerAddress = [];
                    if (options.bytes !== Array)
                        object.makerAddress = $util.newBuffer(object.makerAddress);
                }
            if (message.levels && message.levels.length) {
                object.levels = [];
                for (var j = 0; j < message.levels.length; ++j)
                    object.levels[j] = $root.bebop.LevelInfo.toObject(message.levels[j], options);
            }
            if (message.makerAddress != null && message.hasOwnProperty("makerAddress"))
                object.makerAddress = options.bytes === String ? $util.base64.encode(message.makerAddress, 0, message.makerAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.makerAddress) : message.makerAddress;
            return object;
        };

        /**
         * Converts this LevelMsg to JSON.
         * @function toJSON
         * @memberof bebop.LevelMsg
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        LevelMsg.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for LevelMsg
         * @function getTypeUrl
         * @memberof bebop.LevelMsg
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LevelMsg.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/bebop.LevelMsg";
        };

        return LevelMsg;
    })();

    bebop.LevelsSchema = (function() {

        /**
         * Properties of a LevelsSchema.
         * @memberof bebop
         * @interface ILevelsSchema
         * @property {number|null} [chainId] LevelsSchema chainId
         * @property {string|null} [msgTopic] LevelsSchema msgTopic
         * @property {string|null} [msgType] LevelsSchema msgType
         * @property {bebop.ILevelMsg|null} [msg] LevelsSchema msg
         */

        /**
         * Constructs a new LevelsSchema.
         * @memberof bebop
         * @classdesc Represents a LevelsSchema.
         * @implements ILevelsSchema
         * @constructor
         * @param {bebop.ILevelsSchema=} [properties] Properties to set
         */
        function LevelsSchema(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LevelsSchema chainId.
         * @member {number} chainId
         * @memberof bebop.LevelsSchema
         * @instance
         */
        LevelsSchema.prototype.chainId = 0;

        /**
         * LevelsSchema msgTopic.
         * @member {string} msgTopic
         * @memberof bebop.LevelsSchema
         * @instance
         */
        LevelsSchema.prototype.msgTopic = "";

        /**
         * LevelsSchema msgType.
         * @member {string} msgType
         * @memberof bebop.LevelsSchema
         * @instance
         */
        LevelsSchema.prototype.msgType = "";

        /**
         * LevelsSchema msg.
         * @member {bebop.ILevelMsg|null|undefined} msg
         * @memberof bebop.LevelsSchema
         * @instance
         */
        LevelsSchema.prototype.msg = null;

        /**
         * Creates a new LevelsSchema instance using the specified properties.
         * @function create
         * @memberof bebop.LevelsSchema
         * @static
         * @param {bebop.ILevelsSchema=} [properties] Properties to set
         * @returns {bebop.LevelsSchema} LevelsSchema instance
         */
        LevelsSchema.create = function create(properties) {
            return new LevelsSchema(properties);
        };

        /**
         * Encodes the specified LevelsSchema message. Does not implicitly {@link bebop.LevelsSchema.verify|verify} messages.
         * @function encode
         * @memberof bebop.LevelsSchema
         * @static
         * @param {bebop.ILevelsSchema} message LevelsSchema message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LevelsSchema.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.chainId != null && Object.hasOwnProperty.call(message, "chainId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.chainId);
            if (message.msgTopic != null && Object.hasOwnProperty.call(message, "msgTopic"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.msgTopic);
            if (message.msgType != null && Object.hasOwnProperty.call(message, "msgType"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.msgType);
            if (message.msg != null && Object.hasOwnProperty.call(message, "msg"))
                $root.bebop.LevelMsg.encode(message.msg, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified LevelsSchema message, length delimited. Does not implicitly {@link bebop.LevelsSchema.verify|verify} messages.
         * @function encodeDelimited
         * @memberof bebop.LevelsSchema
         * @static
         * @param {bebop.ILevelsSchema} message LevelsSchema message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LevelsSchema.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a LevelsSchema message from the specified reader or buffer.
         * @function decode
         * @memberof bebop.LevelsSchema
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {bebop.LevelsSchema} LevelsSchema
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LevelsSchema.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.bebop.LevelsSchema();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.chainId = reader.uint32();
                        break;
                    }
                case 2: {
                        message.msgTopic = reader.string();
                        break;
                    }
                case 3: {
                        message.msgType = reader.string();
                        break;
                    }
                case 4: {
                        message.msg = $root.bebop.LevelMsg.decode(reader, reader.uint32());
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
         * Decodes a LevelsSchema message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof bebop.LevelsSchema
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {bebop.LevelsSchema} LevelsSchema
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LevelsSchema.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a LevelsSchema message.
         * @function verify
         * @memberof bebop.LevelsSchema
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        LevelsSchema.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.chainId != null && message.hasOwnProperty("chainId"))
                if (!$util.isInteger(message.chainId))
                    return "chainId: integer expected";
            if (message.msgTopic != null && message.hasOwnProperty("msgTopic"))
                if (!$util.isString(message.msgTopic))
                    return "msgTopic: string expected";
            if (message.msgType != null && message.hasOwnProperty("msgType"))
                if (!$util.isString(message.msgType))
                    return "msgType: string expected";
            if (message.msg != null && message.hasOwnProperty("msg")) {
                var error = $root.bebop.LevelMsg.verify(message.msg);
                if (error)
                    return "msg." + error;
            }
            return null;
        };

        /**
         * Creates a LevelsSchema message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof bebop.LevelsSchema
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {bebop.LevelsSchema} LevelsSchema
         */
        LevelsSchema.fromObject = function fromObject(object) {
            if (object instanceof $root.bebop.LevelsSchema)
                return object;
            var message = new $root.bebop.LevelsSchema();
            if (object.chainId != null)
                message.chainId = object.chainId >>> 0;
            if (object.msgTopic != null)
                message.msgTopic = String(object.msgTopic);
            if (object.msgType != null)
                message.msgType = String(object.msgType);
            if (object.msg != null) {
                if (typeof object.msg !== "object")
                    throw TypeError(".bebop.LevelsSchema.msg: object expected");
                message.msg = $root.bebop.LevelMsg.fromObject(object.msg);
            }
            return message;
        };

        /**
         * Creates a plain object from a LevelsSchema message. Also converts values to other types if specified.
         * @function toObject
         * @memberof bebop.LevelsSchema
         * @static
         * @param {bebop.LevelsSchema} message LevelsSchema
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        LevelsSchema.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.chainId = 0;
                object.msgTopic = "";
                object.msgType = "";
                object.msg = null;
            }
            if (message.chainId != null && message.hasOwnProperty("chainId"))
                object.chainId = message.chainId;
            if (message.msgTopic != null && message.hasOwnProperty("msgTopic"))
                object.msgTopic = message.msgTopic;
            if (message.msgType != null && message.hasOwnProperty("msgType"))
                object.msgType = message.msgType;
            if (message.msg != null && message.hasOwnProperty("msg"))
                object.msg = $root.bebop.LevelMsg.toObject(message.msg, options);
            return object;
        };

        /**
         * Converts this LevelsSchema to JSON.
         * @function toJSON
         * @memberof bebop.LevelsSchema
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        LevelsSchema.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for LevelsSchema
         * @function getTypeUrl
         * @memberof bebop.LevelsSchema
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LevelsSchema.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/bebop.LevelsSchema";
        };

        return LevelsSchema;
    })();

    return bebop;
})();

module.exports = $root;
