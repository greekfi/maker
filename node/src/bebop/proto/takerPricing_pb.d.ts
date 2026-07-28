import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace bebop. */
export namespace bebop {

    /** Properties of a PriceUpdate. */
    interface IPriceUpdate {

        /** PriceUpdate base */
        base?: (Uint8Array|null);

        /** PriceUpdate quote */
        quote?: (Uint8Array|null);

        /** PriceUpdate lastUpdateTs */
        lastUpdateTs?: (number|Long|null);

        /** PriceUpdate bids */
        bids?: (number[]|null);

        /** PriceUpdate asks */
        asks?: (number[]|null);
    }

    /** Represents a PriceUpdate. */
    class PriceUpdate implements IPriceUpdate {

        /**
         * Constructs a new PriceUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: bebop.IPriceUpdate);

        /** PriceUpdate base. */
        public base?: (Uint8Array|null);

        /** PriceUpdate quote. */
        public quote?: (Uint8Array|null);

        /** PriceUpdate lastUpdateTs. */
        public lastUpdateTs?: (number|Long|null);

        /** PriceUpdate bids. */
        public bids: number[];

        /** PriceUpdate asks. */
        public asks: number[];

        /**
         * Creates a new PriceUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns PriceUpdate instance
         */
        public static create(properties?: bebop.IPriceUpdate): bebop.PriceUpdate;

        /**
         * Encodes the specified PriceUpdate message. Does not implicitly {@link bebop.PriceUpdate.verify|verify} messages.
         * @param message PriceUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: bebop.IPriceUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified PriceUpdate message, length delimited. Does not implicitly {@link bebop.PriceUpdate.verify|verify} messages.
         * @param message PriceUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: bebop.IPriceUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PriceUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PriceUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): bebop.PriceUpdate;

        /**
         * Decodes a PriceUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns PriceUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): bebop.PriceUpdate;

        /**
         * Verifies a PriceUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a PriceUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns PriceUpdate
         */
        public static fromObject(object: { [k: string]: any }): bebop.PriceUpdate;

        /**
         * Creates a plain object from a PriceUpdate message. Also converts values to other types if specified.
         * @param message PriceUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: bebop.PriceUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this PriceUpdate to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for PriceUpdate
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a BebopPricingUpdate. */
    interface IBebopPricingUpdate {

        /** BebopPricingUpdate pairs */
        pairs?: (bebop.IPriceUpdate[]|null);
    }

    /** Represents a BebopPricingUpdate. */
    class BebopPricingUpdate implements IBebopPricingUpdate {

        /**
         * Constructs a new BebopPricingUpdate.
         * @param [properties] Properties to set
         */
        constructor(properties?: bebop.IBebopPricingUpdate);

        /** BebopPricingUpdate pairs. */
        public pairs: bebop.IPriceUpdate[];

        /**
         * Creates a new BebopPricingUpdate instance using the specified properties.
         * @param [properties] Properties to set
         * @returns BebopPricingUpdate instance
         */
        public static create(properties?: bebop.IBebopPricingUpdate): bebop.BebopPricingUpdate;

        /**
         * Encodes the specified BebopPricingUpdate message. Does not implicitly {@link bebop.BebopPricingUpdate.verify|verify} messages.
         * @param message BebopPricingUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: bebop.IBebopPricingUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified BebopPricingUpdate message, length delimited. Does not implicitly {@link bebop.BebopPricingUpdate.verify|verify} messages.
         * @param message BebopPricingUpdate message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: bebop.IBebopPricingUpdate, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a BebopPricingUpdate message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns BebopPricingUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): bebop.BebopPricingUpdate;

        /**
         * Decodes a BebopPricingUpdate message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns BebopPricingUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): bebop.BebopPricingUpdate;

        /**
         * Verifies a BebopPricingUpdate message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a BebopPricingUpdate message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns BebopPricingUpdate
         */
        public static fromObject(object: { [k: string]: any }): bebop.BebopPricingUpdate;

        /**
         * Creates a plain object from a BebopPricingUpdate message. Also converts values to other types if specified.
         * @param message BebopPricingUpdate
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: bebop.BebopPricingUpdate, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this BebopPricingUpdate to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for BebopPricingUpdate
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
