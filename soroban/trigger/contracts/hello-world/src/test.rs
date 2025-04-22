#![cfg(test)]

extern crate std; // For std types in tests

use super::*;
use soroban_sdk::{ Env, String };
use std::format;  // 👈 Fix here: Explicitly import format!

fn create_mock_trigger(env: &Env) -> (String, String, String, String, String, u32, u32, u32, bool) {
    (
        String::from_str(env, "manual"),
        String::from_str(env, "readiness"),
        String::from_str(env, "Test Trigger"),
        String::from_str(env, "glofas"),
        String::from_str(env, "Narayani"),
        3,
        7,
        85,
        true,
    )
}

#[test]
fn test_hello() {
    let env = Env::default();
    let name = String::from_str(&env, "Sushant");
    let result = Contract::hello(env.clone(), name.clone());

    assert_eq!(result, vec![&env, String::from_str(&env, "Hello"), name]);
}

#[test]
fn test_increment() {
    let env = Env::default();

    let value1 = Contract::increment(env.clone());
    let value2 = Contract::increment(env.clone());

    assert_eq!(value1, 1);
    assert_eq!(value2, 2);
}

#[test]
fn test_add_and_get_trigger() {
    let env = Env::default();

    let (trigger_type, phase, title, source, river_basin, min_lead, max_lead, probability, is_mandatory) =
        create_mock_trigger(&env);

    let trigger_id = Contract::add_trigger(
        env.clone(),
        trigger_type.clone(),
        phase.clone(),
        title.clone(),
        source.clone(),
        river_basin.clone(),
        min_lead,
        max_lead,
        probability,
        is_mandatory,
    );

    let all_triggers = Contract::get_triggers(env.clone());
    assert!(all_triggers.contains_key(trigger_id.clone()));

    let retrieved_trigger = Contract::get_trigger(env.clone(), trigger_id.clone());
    assert!(retrieved_trigger.is_some());

    let trigger = retrieved_trigger.unwrap();
    assert_eq!(trigger.trigger_type, trigger_type);
    assert_eq!(trigger.phase, phase);
    assert_eq!(trigger.title, title);
    assert_eq!(trigger.source, source);
    assert_eq!(trigger.river_basin, river_basin);
    assert_eq!(trigger.min_lead_time_delay, min_lead);
    assert_eq!(trigger.max_lead_time_delay, max_lead);
    assert_eq!(trigger.forecast_probability, probability);
    assert_eq!(trigger.is_mandatory, is_mandatory);
    assert_eq!(trigger.is_triggered, false);
}

#[test]
fn test_update_trigger_status() {
    let env = Env::default();

    let (trigger_type, phase, title, source, river_basin, min_lead, max_lead, probability, is_mandatory) =
        create_mock_trigger(&env);

    let trigger_id = Contract::add_trigger(
        env.clone(),
        trigger_type,
        phase,
        title,
        source,
        river_basin,
        min_lead,
        max_lead,
        probability,
        is_mandatory,
    );

    let initial_trigger = Contract::get_trigger(env.clone(), trigger_id.clone()).unwrap();
    assert_eq!(initial_trigger.is_triggered, false);

    Contract::update_trigger_status(env.clone(), trigger_id.clone(), true);

    let updated_trigger = Contract::get_trigger(env.clone(), trigger_id.clone()).unwrap();
    assert_eq!(updated_trigger.is_triggered, true);
}

#[test]
fn test_add_multiple_triggers() {
    let env = Env::default();

    for i in 0..5 {
        let trigger_id = Contract::add_trigger(
            env.clone(),
            String::from_str(&env, "manual"),
            String::from_str(&env, "readiness"),
            String::from_str(&env, &format!("Trigger {}", i)),
            String::from_str(&env, "glofas"),
            String::from_str(&env, "Narayani"),
            3,
            7,
            85,
            true,
        );

        let trigger = Contract::get_trigger(env.clone(), trigger_id).unwrap();
        assert_eq!(trigger.title, String::from_str(&env, &format!("Trigger {}", i)));
    }

    let all_triggers = Contract::get_triggers(env.clone());
    assert_eq!(all_triggers.len(), 5);
}
