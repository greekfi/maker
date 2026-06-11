from greek_mm.bebop.proto import pricing_pb2, taker_pricing_pb2


def test_levels_schema_roundtrip() -> None:
    schema = pricing_pb2.LevelsSchema()
    schema.chain_id = 8453
    schema.msg_topic = "pricing"
    schema.msg_type = "update"
    schema.msg.maker_address = bytes.fromhex("11" * 20)

    level = schema.msg.levels.add()
    level.base_address = bytes.fromhex("ab" * 20)
    level.base_decimals = 18
    level.quote_address = bytes.fromhex("cd" * 20)
    level.quote_decimals = 6
    level.bids.extend([95.0, 1000.0])
    level.asks.extend([105.0, 1000.0])

    decoded = pricing_pb2.LevelsSchema.FromString(schema.SerializeToString())
    assert decoded.chain_id == 8453
    assert decoded.msg_topic == "pricing"
    assert decoded.msg.maker_address == bytes.fromhex("11" * 20)
    assert list(decoded.msg.levels[0].bids) == [95.0, 1000.0]
    assert decoded.msg.levels[0].quote_decimals == 6


def test_taker_pricing_roundtrip() -> None:
    update = taker_pricing_pb2.BebopPricingUpdate()
    pair = update.pairs.add()
    pair.base = bytes.fromhex("ab" * 20)
    pair.quote = bytes.fromhex("cd" * 20)
    pair.last_update_ts = 1750000000
    pair.bids.extend([0.5, 100.0, 0.49, 200.0])
    pair.asks.extend([0.51, 100.0])

    decoded = taker_pricing_pb2.BebopPricingUpdate.FromString(update.SerializeToString())
    assert decoded.pairs[0].last_update_ts == 1750000000
    assert list(decoded.pairs[0].bids) == [0.5, 100.0, 0.49, 200.0]
