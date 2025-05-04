#![cfg(test)]

use soroban_sdk::{Env, Symbol, String};

use crate::{Contract, ContractClient};

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
}

#[test]
fn test_update_trigger() {
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
}

#[test]
fn test_nonexistent_trigger() {
    let env = Env::default();
    let contract = ContractClient::new(&env, &env.register_contract(None, Contract));
    assert!(contract.get_trigger(&Symbol::new(&env, "nonexistent")).is_none());
}