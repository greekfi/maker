from greek_mm.bebop.proto import pricing_pb2


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
