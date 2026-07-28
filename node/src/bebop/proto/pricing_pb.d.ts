import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace bebop. */
export namespace bebop {

    /** Properties of a LevelInfo. */
    interface ILevelInfo {

        /** LevelInfo baseAddress */
        baseAddress?: (Uint8Array|null);

        /** LevelInfo baseDecimals */
        baseDecimals?: (number|null);

        /** LevelInfo quoteAddress */
        quoteAddress?: (Uint8Array|null);

        /** LevelInfo quoteDecimals */
        quoteDecimals?: (number|null);

        /** LevelInfo bids */
        bids?: (number[]|null);

        /** LevelInfo asks */
        asks?: (number[]|null);
    }

    /** Represents a LevelInfo. */
    class LevelInfo implements ILevelInfo {

        /**
         * Constructs a new LevelInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: bebop.ILevelInfo);

        /** LevelInfo baseAddress. */
        public baseAddress: Uint8Array;

        /** LevelInfo baseDecimals. */
        public baseDecimals: number;

        /** LevelInfo quoteAddress. */
        public quoteAddress: Uint8Array;

        /** LevelInfo quoteDecimals. */
        public quoteDecimals: number;

        /** LevelInfo bids. */
        public bids: number[];

        /** LevelInfo asks. */
        public asks: number[];

        /**
         * Creates a new LevelInfo instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LevelInfo instance
         */
        public static create(properties?: bebop.ILevelInfo): bebop.LevelInfo;

        /**
         * Encodes the specified LevelInfo message. Does not implicitly {@link bebop.LevelInfo.verify|verify} messages.
         * @param message LevelInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: bebop.ILevelInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LevelInfo message, length delimited. Does not implicitly {@link bebop.LevelInfo.verify|verify} messages.
         * @param message LevelInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: bebop.ILevelInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LevelInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LevelInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): bebop.LevelInfo;

        /**
         * Decodes a LevelInfo message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns LevelInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): bebop.LevelInfo;

        /**
         * Verifies a LevelInfo message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LevelInfo message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LevelInfo
         */
        public static fromObject(object: { [k: string]: any }): bebop.LevelInfo;

        /**
         * Creates a plain object from a LevelInfo message. Also converts values to other types if specified.
         * @param message LevelInfo
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: bebop.LevelInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LevelInfo to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for LevelInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LevelMsg. */
    interface ILevelMsg {

        /** LevelMsg levels */
        levels?: (bebop.ILevelInfo[]|null);

        /** LevelMsg makerAddress */
        makerAddress?: (Uint8Array|null);
    }

    /** Represents a LevelMsg. */
    class LevelMsg implements ILevelMsg {

        /**
         * Constructs a new LevelMsg.
         * @param [properties] Properties to set
         */
        constructor(properties?: bebop.ILevelMsg);

        /** LevelMsg levels. */
        public levels: bebop.ILevelInfo[];

        /** LevelMsg makerAddress. */
        public makerAddress: Uint8Array;

        /**
         * Creates a new LevelMsg instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LevelMsg instance
         */
        public static create(properties?: bebop.ILevelMsg): bebop.LevelMsg;

        /**
         * Encodes the specified LevelMsg message. Does not implicitly {@link bebop.LevelMsg.verify|verify} messages.
         * @param message LevelMsg message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: bebop.ILevelMsg, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LevelMsg message, length delimited. Does not implicitly {@link bebop.LevelMsg.verify|verify} messages.
         * @param message LevelMsg message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: bebop.ILevelMsg, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LevelMsg message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LevelMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): bebop.LevelMsg;

        /**
         * Decodes a LevelMsg message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns LevelMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): bebop.LevelMsg;

        /**
         * Verifies a LevelMsg message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LevelMsg message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LevelMsg
         */
        public static fromObject(object: { [k: string]: any }): bebop.LevelMsg;

        /**
         * Creates a plain object from a LevelMsg message. Also converts values to other types if specified.
         * @param message LevelMsg
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: bebop.LevelMsg, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LevelMsg to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for LevelMsg
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LevelsSchema. */
    interface ILevelsSchema {

        /** LevelsSchema chainId */
        chainId?: (number|null);

        /** LevelsSchema msgTopic */
        msgTopic?: (string|null);

        /** LevelsSchema msgType */
        msgType?: (string|null);

        /** LevelsSchema msg */
        msg?: (bebop.ILevelMsg|null);
    }

    /** Represents a LevelsSchema. */
    class LevelsSchema implements ILevelsSchema {

        /**
         * Constructs a new LevelsSchema.
         * @param [properties] Properties to set
         */
        constructor(properties?: bebop.ILevelsSchema);

        /** LevelsSchema chainId. */
        public chainId: number;

        /** LevelsSchema msgTopic. */
        public msgTopic: string;

        /** LevelsSchema msgType. */
        public msgType: string;

        /** LevelsSchema msg. */
        public msg?: (bebop.ILevelMsg|null);

        /**
         * Creates a new LevelsSchema instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LevelsSchema instance
         */
        public static create(properties?: bebop.ILevelsSchema): bebop.LevelsSchema;

        /**
         * Encodes the specified LevelsSchema message. Does not implicitly {@link bebop.LevelsSchema.verify|verify} messages.
         * @param message LevelsSchema message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: bebop.ILevelsSchema, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LevelsSchema message, length delimited. Does not implicitly {@link bebop.LevelsSchema.verify|verify} messages.
         * @param message LevelsSchema message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: bebop.ILevelsSchema, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LevelsSchema message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LevelsSchema
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): bebop.LevelsSchema;

        /**
         * Decodes a LevelsSchema message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns LevelsSchema
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): bebop.LevelsSchema;

        /**
         * Verifies a LevelsSchema message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LevelsSchema message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LevelsSchema
         */
        public static fromObject(object: { [k: string]: any }): bebop.LevelsSchema;

        /**
         * Creates a plain object from a LevelsSchema message. Also converts values to other types if specified.
         * @param message LevelsSchema
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: bebop.LevelsSchema, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LevelsSchema to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for LevelsSchema
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
