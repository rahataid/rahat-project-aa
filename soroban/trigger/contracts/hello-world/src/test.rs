#![cfg(test)]

use soroban_sdk::{Env, Symbol, String, testutils::ContractFunctionError};

use crate::{Contract, ContractClient, Trigger, ContractError};

#[test]
fn test_add_and_get_trigger() {
    let env = Env::default();
    let contract = ContractClient::new(&env, &env.register_contract(None, Contract));

    contract.add_trigger(
        &Symbol::new(&env, "test1"),
        &String::from_str(&env, "flood"),
        &String::from_str(&env, "response"),
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "sensor"),
        &String::from_str(&env, "nile"),
        &String::from_str(&env, "hash123"),
        &true,
    );

    let stored = contract.get_trigger(&Symbol::new(&env, "test1")).unwrap();
    assert_eq!(stored.title, String::from_str(&env, "Test"));
    assert_eq!(stored.trigger_type, String::from_str(&env, "flood"));
    assert_eq!(stored.phase, String::from_str(&env, "response"));
    assert_eq!(stored.source, String::from_str(&env, "sensor"));
    assert_eq!(stored.river_basin, String::from_str(&env, "nile"));
    assert_eq!(stored.params_hash, String::from_str(&env, "hash123"));
    assert_eq!(stored.is_mandatory, true);
    assert_eq!(stored.is_triggered, false);
}

#[test]
fn test_update_trigger_to_triggered() {
    let env = Env::default();
    let contract = ContractClient::new(&env, &env.register_contract(None, Contract));

    contract.add_trigger(
        &Symbol::new(&env, "test2"),
        &String::from_str(&env, "flood"),
        &String::from_str(&env, "response"),
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "sensor"),
        &String::from_str(&env, "nile"),
        &String::from_str(&env, "hash123"),
        &true,
    );

    contract.update_trigger_to_triggered(&Symbol::new(&env, "test2"));
    let stored = contract.get_trigger(&Symbol::new(&env, "test2")).unwrap();
    assert!(stored.is_triggered);
    assert_eq!(stored.title, String::from_str(&env, "Test"));
    assert_eq!(stored.params_hash, String::from_str(&env, "hash123"));
    assert_eq!(stored.source, String::from_str(&env, "sensor"));
}

#[test]
fn test_update_trigger_params() {
    let env = Env::default();
    let contract = ContractClient::new(&env, &env.register_contract(None, Contract));

    contract.add_trigger(
        &Symbol::new(&env, "test3"),
        &String::from_str(&env, "drought"),
        &String::from_str(&env, "monitoring"),
        &String::from_str(&env, "Drought Alert"),
        &String::from_str(&env, "weather_api"),
        &String::from_str(&env, "amazon"),
        &String::from_str(&env, "old_hash456"),
        &false,
    );

    contract.update_trigger_params(
        &Symbol::new(&env, "test3"),
        &String::from_str(&env, "new_hash789"),
        &String::from_str(&env, "new_weather_api"),
    );

    let stored = contract.get_trigger(&Symbol::new(&env, "test3")).unwrap();
    assert_eq!(stored.params_hash, String::from_str(&env, "new_hash789"));
    assert_eq!(stored.source, String::from_str(&env, "new_weather_api"));
    assert_eq!(stored.trigger_type, String::from_str(&env, "drought"));
    assert_eq!(stored.phase, String::from_str(&env, "monitoring"));
    assert_eq!(stored.title, String::from_str(&env, "Drought Alert"));
    assert_eq!(stored.river_basin, String::from_str(&env, "amazon"));
    assert_eq!(stored.is_mandatory, false);
    assert_eq!(stored.is_triggered, false);
}

#[test]
fn test_nonexistent_trigger() {
    let env = Env::default();
    let contract = ContractClient::new(&env, &env.register_contract(None, Contract));
    assert!(contract.get_trigger(&Symbol::new(&env, "nonexistent")).is_none());
}

#[test]
fn test_duplicate_trigger_id() {
    let env = Env::default();
    let contract = ContractClient::new(&env, &env.register_contract(None, Contract));

    // Add a trigger
    contract.add_trigger(
        &Symbol::new(&env, "test4"),
        &String::from_str(&env, "flood"),
        &String::from_str(&env, "alert"),
        &String::from_str(&env, "Flood Warning"),
        &String::from_str(&env, "sensor"),
        &String::from_str(&env, "yangtze"),
        &String::from_str(&env, "hash789"),
        &true,
    );

    // Attempt to add another trigger with the same ID
    let result = contract.try_add_trigger(
        &Symbol::new(&env, "test4"),
        &String::from_str(&env, "drought"),
        &String::from_str(&env, "monitoring"),
        &String::from_str(&env, "Drought Warning"),
        &String::from_str(&env, "weather_api"),
        &String::from_str(&env, "amazon"),
        &String::from_str(&env, "new_hash456"),
        &false,
    );

    // Verify that the operation fails with TriggerIdAlreadyExists error
    assert_eq!(
        result,
        Err(ContractFunctionError::ContractError(ContractError::TriggerIdAlreadyExists))
    );

    // Verify that the original trigger is unchanged
    let stored = contract.get_trigger(&Symbol::new(&env, "test4")).unwrap();
    assert_eq!(stored.title, String::from_str(&env, "Flood Warning"));
    assert_eq!(stored.params_hash, String::from_str(&env, "hash789"));
}